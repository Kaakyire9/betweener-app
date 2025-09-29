# Android Environment Setup Script
# Run this after installing Android Studio

# Set ANDROID_HOME (typical installation path)
$env:ANDROID_HOME = "C:\Users\HP\AppData\Local\Android\Sdk"

# Add to PATH
$env:PATH = "$env:PATH;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\tools;$env:ANDROID_HOME\tools\bin"

# Set permanently in system environment
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:ANDROID_HOME", "User")
[Environment]::SetEnvironmentVariable("PATH", "$env:PATH", "User")

Write-Host "Android environment variables set!"
Write-Host "ANDROID_HOME: $env:ANDROID_HOME"
Write-Host "Please restart your terminal/VS Code for changes to take effect."
