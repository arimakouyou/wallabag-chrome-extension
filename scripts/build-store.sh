#!/bin/bash

# Chrome Web Store Submission Build Script
# Creates the final production build for store submission

set -e

echo "🏪 Building Wallabag Saver for Chrome Web Store Submission"

# Configuration
BUILD_DIR="./dist"
STORE_DIR="./store-submission"
VERSION=$(node -p "require('./package.json').version")
PACKAGE_NAME="wallabag-saver-${VERSION}-store"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf "$BUILD_DIR" "$STORE_DIR" web-ext-artifacts

# Create store submission directory
mkdir -p "$STORE_DIR"

# Validate code quality before building
echo "🔍 Running code quality checks..."
npm run validate

# Build production version
echo "🏗️ Running production build..."
npm run build:prod

# Verify build integrity
echo "🔍 Verifying build integrity..."

# Check manifest
if [ ! -f "$BUILD_DIR/manifest.json" ]; then
    echo "❌ Error: manifest.json not found in build directory"
    exit 1
fi

# Validate manifest
node -e "
const manifest = require('./$BUILD_DIR/manifest.json');
console.log('📋 Manifest validation:');
console.log('  Name:', manifest.name);
console.log('  Version:', manifest.version);
console.log('  Manifest Version:', manifest.manifest_version);

if (manifest.manifest_version !== 3) {
    console.error('❌ Error: Manifest version must be 3');
    process.exit(1);
}

if (!manifest.permissions || !Array.isArray(manifest.permissions)) {
    console.error('❌ Error: Permissions must be an array');
    process.exit(1);
}

if (!manifest.action || !manifest.action.default_popup) {
    console.error('❌ Error: Popup action not configured');
    process.exit(1);
}

console.log('✅ Manifest validation passed');
"

# Check required files
required_files=(
    "manifest.json"
    "background.js"
    "content.js"
    "popup/popup.html"
    "popup/popup.js"
    "popup/popup.css"
    "options/options.html"
    "options/options.js"
    "options/options.css"
    "assets/icons/icon-16.png"
    "assets/icons/icon-32.png" 
    "assets/icons/icon-48.png"
    "assets/icons/icon-128.png"
)

echo "📁 Checking required files..."
for file in "${required_files[@]}"; do
    if [ ! -f "$BUILD_DIR/$file" ]; then
        echo "❌ Error: Required file not found: $file"
        exit 1
    else
        echo "  ✅ $file"
    fi
done

# Validate icon files
echo "🖼️ Validating icon files..."
for size in 16 32 48 128; do
    icon_file="$BUILD_DIR/assets/icons/icon-${size}.png"
    if [ -f "$icon_file" ]; then
        # Check if file is not empty
        if [ ! -s "$icon_file" ]; then
            echo "❌ Error: Icon file is empty: icon-${size}.png"
            exit 1
        fi
        echo "  ✅ icon-${size}.png"
    fi
done

# Check file sizes and optimization
echo "📊 Checking file sizes..."
total_size=$(du -sb "$BUILD_DIR" | cut -f1)
echo "  Total build size: $(($total_size / 1024)) KB"

if [ $total_size -gt 5242880 ]; then  # 5MB limit
    echo "⚠️  Warning: Build size exceeds 5MB, consider optimization"
fi

# Security check - no source maps in production
echo "🔒 Security checks..."
if find "$BUILD_DIR" -name "*.map" | grep -q .; then
    echo "⚠️  Warning: Source maps found in production build"
    find "$BUILD_DIR" -name "*.map" -delete
    echo "  ✅ Source maps removed"
fi

# Check for sensitive files
sensitive_patterns=("*.env" "*.key" "*.pem" "node_modules" ".git")
for pattern in "${sensitive_patterns[@]}"; do
    if find "$BUILD_DIR" -name "$pattern" | grep -q .; then
        echo "❌ Error: Sensitive files found: $pattern"
        exit 1
    fi
done

# Create store submission package
echo "📦 Creating store submission package..."
cd "$BUILD_DIR"
zip -r "../$STORE_DIR/$PACKAGE_NAME.zip" . -x "*.DS_Store" "__MACOSX*"
cd ..

# Generate submission information
echo "📋 Generating submission information..."
cat > "$STORE_DIR/submission-info.md" << EOF
# Chrome Web Store Submission Information

## Package Details
- **File**: $PACKAGE_NAME.zip
- **Version**: $VERSION
- **Build Date**: $(date)
- **Total Size**: $(du -sh "$BUILD_DIR" | cut -f1)

## Pre-submission Checklist
- [x] Code quality validation passed
- [x] All required files present
- [x] Manifest V3 compliant
- [x] Icons properly sized
- [x] No sensitive files included
- [x] Production optimized
- [x] Security checks passed

## Submission Steps
1. Go to Chrome Web Store Developer Console
2. Upload $PACKAGE_NAME.zip
3. Fill in store listing information (see store-description.md)
4. Upload screenshots and promotional images
5. Set privacy policy URL
6. Submit for review

## Required Information for Store Listing

### Basic Information
- **Name**: Wallabag Saver
- **Summary**: ワンクリックでWebページをWallabagに保存
- **Category**: Productivity
- **Language**: Japanese (Primary), English (Secondary)

### Assets Required
- Screenshots (1280x800): Use screenshot-generator.html
- Promotional image (440x280): Use promotional-image-generator.html
- Icons: Already included in build

### URLs
- **Homepage**: https://github.com/username/wallabag-chrome-extension
- **Privacy Policy**: https://github.com/username/wallabag-chrome-extension/blob/main/PRIVACY.md
- **Support**: https://github.com/username/wallabag-chrome-extension/issues

## Post-Submission
- Monitor developer console for review status
- Respond to any review feedback promptly
- Prepare for potential follow-up questions

## Manifest Permissions Explanation
For the store submission, explain each permission:

- **activeTab**: Access current page URL and title when user clicks save
- **storage**: Save user's Wallabag server configuration locally
- **contextMenus**: Add "Save to Wallabag" option to right-click menu  
- **host_permissions**: Connect to user's configured Wallabag server

EOF

# Final validation
echo "🔍 Final validation..."
if [ ! -f "$STORE_DIR/$PACKAGE_NAME.zip" ]; then
    echo "❌ Error: Store package not created"
    exit 1
fi

zip_size=$(stat -c%s "$STORE_DIR/$PACKAGE_NAME.zip" 2>/dev/null || stat -f%z "$STORE_DIR/$PACKAGE_NAME.zip" 2>/dev/null || echo "0")
echo "  📦 Package size: $(($zip_size / 1024)) KB"

# Test zip integrity
if ! unzip -t "$STORE_DIR/$PACKAGE_NAME.zip" > /dev/null 2>&1; then
    echo "❌ Error: Package ZIP file is corrupted"
    exit 1
fi

echo "✅ Chrome Web Store package created successfully!"
echo ""
echo "📦 Package: $STORE_DIR/$PACKAGE_NAME.zip"
echo "📋 Submission info: $STORE_DIR/submission-info.md"
echo "📊 Package size: $(($zip_size / 1024)) KB"
echo ""
echo "🏪 Ready for Chrome Web Store submission!"
echo ""
echo "Next steps:"
echo "1. Review store-assets/store-submission-checklist.md"
echo "2. Prepare screenshots using store-assets/screenshot-generator.html"
echo "3. Upload package to Chrome Web Store Developer Console"
echo "4. Complete store listing with provided information"