# Privacy Policy - Wallabag Saver Chrome Extension

*Last updated: August 3, 2025*

## Overview

Wallabag Saver is a Chrome extension that allows users to save web pages to their personal Wallabag server. This privacy policy explains how the extension handles user data.

## Data Collection and Usage

### What Data We Access
- **Current Tab Information**: URL and title of the page you choose to save
- **Page Metadata**: Description and favicon of pages being saved (when available)
- **Wallabag Server Configuration**: Server URL, client credentials, and authentication tokens you provide

### What Data We Store
- **Configuration Data**: Your Wallabag server settings are stored locally in Chrome's storage
- **Authentication Tokens**: OAuth2 tokens are stored locally for maintaining connection to your server
- **No Personal Data**: We do not collect, store, or transmit any personal information about users

### What Data We Transmit
- **To Your Wallabag Server Only**: Page URLs, titles, and metadata are sent exclusively to the Wallabag server you configure
- **No Third-Party Services**: No data is sent to any third-party services or analytics platforms
- **No Tracking**: We do not track user behavior or usage patterns

## Data Security

### Local Storage
- All configuration data is stored locally on your device using Chrome's secure storage API
- Authentication tokens are stored securely and are only accessible by this extension
- No data is synchronized across devices unless you choose to sync Chrome extensions

### Communication Security
- All communication with Wallabag servers uses HTTPS encryption
- OAuth2 authentication ensures secure access to your Wallabag account
- No data is transmitted to any servers other than your configured Wallabag instance

## Data Sharing

We do not share, sell, or transmit any user data to third parties. The extension only communicates with:
- Your configured Wallabag server (for saving articles)
- Chrome's built-in APIs (for local storage and tab access)

## User Control

### What You Can Control
- **Configuration**: You control what Wallabag server the extension connects to
- **Article Selection**: You decide which pages to save
- **Data Removal**: You can clear all stored data by removing the extension or clearing Chrome's extension data

### Data Retention
- Configuration data is retained until you uninstall the extension or clear its data
- Authentication tokens expire based on your Wallabag server's settings
- No data is retained after extension removal

## Permissions Explanation

### activeTab
- **Purpose**: Access current tab's URL and title when you choose to save a page
- **Scope**: Only the tab you're actively using when triggering the save action
- **Usage**: Required to capture page information for saving to Wallabag

### storage
- **Purpose**: Store your Wallabag server configuration and authentication tokens
- **Scope**: Local device storage only
- **Usage**: Maintains your settings between browser sessions

### contextMenus
- **Purpose**: Add "Save to Wallabag" option to right-click menu
- **Scope**: Context menu integration only
- **Usage**: Provides convenient access to save functionality

### host_permissions: <all_urls>
- **Purpose**: Connect to your configured Wallabag server
- **Scope**: Only the Wallabag server you specify in settings
- **Usage**: Required to send saved articles to your Wallabag instance

## Third-Party Services

This extension does not use any third-party services, analytics, or tracking tools. All functionality is provided directly by the extension code.

## Open Source

This extension is open source and available for review at:
https://github.com/yourusername/wallabag-chrome-extension

Users can inspect the code to verify privacy practices and security implementations.

## Changes to Privacy Policy

Any changes to this privacy policy will be posted in the extension's GitHub repository and reflected in extension updates. Users will be notified of significant changes through the extension update mechanism.

## Contact

For privacy-related questions or concerns, please:
- Open an issue on the GitHub repository
- Review the source code for technical details about data handling

## Compliance

This extension is designed to comply with:
- Chrome Web Store Developer Policies
- General privacy best practices
- Minimal data collection principles

By using this extension, you acknowledge that you understand and agree to this privacy policy.