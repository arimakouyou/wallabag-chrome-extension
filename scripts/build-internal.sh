#!/bin/bash

# Internal Testing Build Script
# Builds and packages the extension for internal testing

set -e

echo "🔨 Building Wallabag Saver for Internal Testing"

# Configuration
BUILD_DIR="./dist"
OUTPUT_DIR="./internal-testing"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
VERSION=$(node -p "require('./package.json').version")
PACKAGE_NAME="wallabag-saver-internal-${VERSION}-${TIMESTAMP}"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build production version
echo "🏗️ Running production build..."
npm run build:prod

# Modify manifest for internal testing
echo "📝 Modifying manifest for internal testing..."
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('$BUILD_DIR/manifest.json', 'utf8'));
manifest.name += ' (Internal Testing)';
manifest.version = '$VERSION-internal-$TIMESTAMP';
fs.writeFileSync('$BUILD_DIR/manifest.json', JSON.stringify(manifest, null, 2));
console.log('✅ Manifest updated');
"

# Create ZIP package
echo "📦 Creating ZIP package..."
cd "$BUILD_DIR"
zip -r "../$OUTPUT_DIR/$PACKAGE_NAME.zip" . -x "*.map" "*.DS_Store"
cd ..

# Create unpacked directory for development
echo "📁 Creating unpacked directory..."
cp -r "$BUILD_DIR" "$OUTPUT_DIR/$PACKAGE_NAME"

# Generate installation script
echo "📋 Generating installation instructions..."
cat > "$OUTPUT_DIR/install-instructions.md" << EOF
# Wallabag Saver - Internal Testing Installation

## Quick Install (Chrome)

### Method 1: Unpacked Extension (Recommended for testing)
1. Open Chrome and go to \`chrome://extensions/\`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the \`$PACKAGE_NAME\` folder

### Method 2: ZIP Package
1. Extract \`$PACKAGE_NAME.zip\`
2. Follow Method 1 with extracted folder

## Configuration
1. Click the extension icon in Chrome toolbar
2. Click "設定" (Settings)
3. Enter your Wallabag server details:
   - Server URL: https://your-wallabag-server.com
   - Client ID: (from Wallabag API)
   - Client Secret: (from Wallabag API)
   - Username: your-username
   - Password: your-password
4. Click "保存" (Save)
5. Click "接続テスト" (Test Connection) to verify

## Testing Checklist
- [ ] Extension loads without errors
- [ ] Settings page opens and saves configuration
- [ ] Test connection succeeds
- [ ] Save article from popup works
- [ ] Save article from context menu works
- [ ] Status messages display correctly
- [ ] No console errors in DevTools

## Package Information
- Version: $VERSION-internal-$TIMESTAMP
- Build Date: $(date)
- Package: $PACKAGE_NAME.zip

## Support
Report issues with:
- Chrome version
- OS version
- Error messages
- Console logs (F12 → Console)
EOF

# Generate test suite
echo "🧪 Generating test suite..."
cat > "$OUTPUT_DIR/test-suite.html" << 'EOF'
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wallabag Saver Test Suite</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; }
        .test-section { margin: 20px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
        .test-item { margin: 10px 0; }
        .test-item input[type="checkbox"] { margin-right: 10px; }
        .success { color: #28a745; }
        .error { color: #dc3545; }
        .warning { color: #ffc107; }
        .code { background: #f8f9fa; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    </style>
</head>
<body>
    <h1>Wallabag Saver - Internal Testing Suite</h1>
    
    <div class="test-section">
        <h2>1. Installation Testing</h2>
        <div class="test-item">
            <input type="checkbox" id="install-1"> Extension installs without errors
        </div>
        <div class="test-item">
            <input type="checkbox" id="install-2"> Extension icon appears in toolbar
        </div>
        <div class="test-item">
            <input type="checkbox" id="install-3"> No console errors on installation
        </div>
    </div>

    <div class="test-section">
        <h2>2. Configuration Testing</h2>
        <div class="test-item">
            <input type="checkbox" id="config-1"> Settings page opens from popup
        </div>
        <div class="test-item">
            <input type="checkbox" id="config-2"> All form fields accept input
        </div>
        <div class="test-item">
            <input type="checkbox" id="config-3"> Settings save successfully
        </div>
        <div class="test-item">
            <input type="checkbox" id="config-4"> Connection test works with valid credentials
        </div>
        <div class="test-item">
            <input type="checkbox" id="config-5"> Error shown for invalid credentials
        </div>
    </div>

    <div class="test-section">
        <h2>3. Core Functionality Testing</h2>
        <div class="test-item">
            <input type="checkbox" id="core-1"> Popup opens from extension icon
        </div>
        <div class="test-item">
            <input type="checkbox" id="core-2"> "このページを保存" button works
        </div>
        <div class="test-item">
            <input type="checkbox" id="core-3"> Success message shows after save
        </div>
        <div class="test-item">
            <input type="checkbox" id="core-4"> Right-click context menu appears
        </div>
        <div class="test-item">
            <input type="checkbox" id="core-5"> Context menu save works
        </div>
        <div class="test-item">
            <input type="checkbox" id="core-6"> Article appears in Wallabag
        </div>
    </div>

    <div class="test-section">
        <h2>4. Error Handling Testing</h2>
        <div class="test-item">
            <input type="checkbox" id="error-1"> Network error shows appropriate message
        </div>
        <div class="test-item">
            <input type="checkbox" id="error-2"> Invalid server URL shows error
        </div>
        <div class="test-item">
            <input type="checkbox" id="error-3"> Authentication error shows message
        </div>
        <div class="test-item">
            <input type="checkbox" id="error-4"> No crashes on various page types
        </div>
    </div>

    <div class="test-section">
        <h2>5. Performance Testing</h2>
        <div class="test-item">
            <input type="checkbox" id="perf-1"> Extension loads quickly (&lt;2s)
        </div>
        <div class="test-item">
            <input type="checkbox" id="perf-2"> Save operation completes in &lt;5s
        </div>
        <div class="test-item">
            <input type="checkbox" id="perf-3"> No memory leaks during extended use
        </div>
        <div class="test-item">
            <input type="checkbox" id="perf-4"> Multiple saves work without issues
        </div>
    </div>

    <div class="test-section">
        <h2>Test Environment</h2>
        <p><strong>Chrome Version:</strong> <span class="code" id="chrome-version">Check in chrome://version/</span></p>
        <p><strong>OS:</strong> <span class="code" id="os-version">Windows/Mac/Linux version</span></p>
        <p><strong>Extension Version:</strong> <span class="code">Check in chrome://extensions/</span></p>
        <p><strong>Test Date:</strong> <span class="code" id="test-date"></span></p>
    </div>

    <script>
        document.getElementById('test-date').textContent = new Date().toLocaleString('ja-JP');
        
        // Auto-save test results to localStorage
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            const saved = localStorage.getItem('test-' + cb.id);
            if (saved === 'true') cb.checked = true;
            
            cb.addEventListener('change', () => {
                localStorage.setItem('test-' + cb.id, cb.checked);
            });
        });
    </script>
</body>
</html>
EOF

echo "✅ Internal testing package created successfully!"
echo ""
echo "📦 Package: $OUTPUT_DIR/$PACKAGE_NAME.zip"
echo "📁 Unpacked: $OUTPUT_DIR/$PACKAGE_NAME/"
echo "📋 Instructions: $OUTPUT_DIR/install-instructions.md"
echo "🧪 Test Suite: $OUTPUT_DIR/test-suite.html"
echo ""
echo "Next steps:"
echo "1. Share the unpacked folder or ZIP file with testers"
echo "2. Provide install-instructions.md"
echo "3. Use test-suite.html to track testing progress"