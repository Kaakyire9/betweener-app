"""Tests for rejecting native API regressions; these do not validate mobile media."""
from pathlib import Path
import importlib.util
import io
import shutil
import subprocess
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location('compatibility', Path(__file__).with_name('verify-compatibility.py'))
compatibility = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compatibility)


class CompatibilityGuards(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='betweener-native-api-')
        self.root = Path(self.temporary.name).resolve()

    def tearDown(self):
        if not self.root.is_relative_to(Path(tempfile.gettempdir()).resolve()):
            raise RuntimeError('Unexpected fixture cleanup target')
        self.temporary.cleanup()

    def framework(self, name, declaration):
        archive = self.root / name
        with zipfile.ZipFile(archive, 'w') as zipped:
            for slice_name in ['ios-arm64', 'ios-arm64_x86_64-simulator']:
                directory = 'WebRTC.xcframework/' + slice_name + '/WebRTC.framework/Headers/'
                zipped.writestr(directory + 'WebRTC.h', '#import "RTCEncryptionManager.h"\n')
                zipped.writestr(directory + 'RTCEncryptionManager.h', declaration)
        return archive

    def test_changed_ios_declaration_is_rejected(self):
        old = self.framework('old.zip', 'void enableEncryption(void);')
        new = self.framework('new.zip', 'void otherApi(void);')
        with self.assertRaisesRegex(ValueError, 'public headers differ'):
            compatibility.compare_ios(old, new)

    def test_missing_ios_api_is_rejected(self):
        archive = self.root / 'empty.zip'
        with zipfile.ZipFile(archive, 'w'): pass
        with self.assertRaisesRegex(ValueError, 'headers are missing'):
            compatibility.ios_headers(archive)

    def aar(self, name, declaration):
        compiler = shutil.which('javac')
        if not compiler: self.fail('JDK javac required to test real Java API drift detection')
        directory = self.root / name
        directory.mkdir()
        java = directory / 'Probe.java'
        java.write_text('package org.webrtc; public class Probe {' + declaration + '}')
        subprocess.run([compiler, '-d', str(directory), str(java)], check=True, capture_output=True, timeout=30)
        jar_data = io.BytesIO()
        with zipfile.ZipFile(jar_data, 'w') as jar:
            jar.write(directory / 'org/webrtc/Probe.class', 'org/webrtc/Probe.class')
        output = directory / 'library.aar'
        with zipfile.ZipFile(output, 'w') as aar: aar.writestr('classes.jar', jar_data.getvalue())
        return output

    def test_changed_java_method_is_rejected(self):
        old = self.aar('old', 'public void enableEncryption() {}')
        new = self.aar('new', 'public void otherApi() {}')
        with self.assertRaisesRegex(ValueError, 'Java API differs'):
            compatibility.compare_android(old, new, self.root / 'results')

    def test_equal_java_api_is_accepted(self):
        old = self.aar('old', 'public void enableEncryption() {}')
        new = self.aar('new', 'public void enableEncryption() {}')
        self.assertEqual(compatibility.compare_android(old, new, self.root / 'results')['status'], 'PASS')


if __name__ == '__main__': unittest.main()
