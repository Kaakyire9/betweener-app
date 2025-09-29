# Fix Android Setup Script for Betweener App
# This script permanently sets up Android development environment

Write-Host "🔧 Setting up Android development environment..." -ForegroundColor Green

# Set Android SDK path
$ANDROID_HOME = "C:\Users\HP\AppData\Local\Android\Sdk"

# Check if Android SDK exists
if (Test-Path $ANDROID_HOME) {
    Write-Host "✅ Android SDK found at: $ANDROID_HOME" -ForegroundColor Green
    
    # Set environment variables permanently
    [Environment]::SetEnvironmentVariable("ANDROID_HOME", $ANDROID_HOME, "User")
    [Environment]::SetEnvironmentVariable("ANDROID_SDK_ROOT", $ANDROID_HOME, "User")
    
    # Get current PATH
    $currentPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    
    # Add Android tools to PATH if not already present
    $pathsToAdd = @(
        "$ANDROID_HOME\platform-tools",
        "$ANDROID_HOME\tools",
        "$ANDROID_HOME\tools\bin",
        "$ANDROID_HOME\emulator"
    )
    
    foreach ($pathToAdd in $pathsToAdd) {
        if ($currentPath -notlike "*$pathToAdd*") {
            $currentPath = "$currentPath;$pathToAdd"
        }
    }
    
    # Set the updated PATH
    [Environment]::SetEnvironmentVariable("PATH", $currentPath, "User")
    
    Write-Host "✅ Environment variables set permanently!" -ForegroundColor Green
    Write-Host "✅ Android tools added to PATH!" -ForegroundColor Green
    
    # Set for current session
    $env:ANDROID_HOME = $ANDROID_HOME
    $env:ANDROID_SDK_ROOT = $ANDROID_HOME
    $env:PATH = "$env:PATH;$ANDROID_HOME\platform-tools;$ANDROID_HOME\tools;$ANDROID_HOME\tools\bin;$ANDROID_HOME\emulator"
    
    Write-Host "✅ Current session updated!" -ForegroundColor Green
    
    # Test ADB
    Write-Host "`n🔍 Testing ADB connection..." -ForegroundColor Yellow
    try {
        & "$ANDROID_HOME\platform-tools\adb.exe" --version
        Write-Host "✅ ADB is working!" -ForegroundColor Green
    } catch {
        Write-Host "❌ ADB test failed" -ForegroundColor Red
    }
    
    # List available emulators
    Write-Host "`n📱 Available Android emulators:" -ForegroundColor Yellow
    try {
        & "$ANDROID_HOME\emulator\emulator.exe" -list-avds
    } catch {
        Write-Host "❌ Could not list emulators" -ForegroundColor Red
    }
    
    Write-Host "`n🎉 Android setup complete!" -ForegroundColor Green
    Write-Host "💡 Restart VS Code/Terminal for permanent changes to take effect" -ForegroundColor Yellow
    Write-Host "`n📱 Recommended: Use Expo Go app for easier testing:" -ForegroundColor Cyan
    Write-Host "   1. Install 'Expo Go' from Google Play Store" -ForegroundColor White
    Write-Host "   2. Run 'npx expo start' in your project" -ForegroundColor White
    Write-Host "   3. Scan QR code with Expo Go app" -ForegroundColor White
    
} else {
    Write-Host "❌ Android SDK not found at: $ANDROID_HOME" -ForegroundColor Red
    Write-Host "💡 Please install Android Studio first" -ForegroundColor Yellow
}