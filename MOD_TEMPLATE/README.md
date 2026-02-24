# Mod Template

This folder is a **template** to help you understand the basic structure of a mod submission.

## What You Need

```
your-mod-name/
├── manifest.json    (required)
├── mod.js          (or your main mod file)
└── cover.png       (optional but recommended)
```

## Quick Start

1. **Copy this template** or create a new folder for your mod
2. **Edit `manifest.json`** with your mod's information
3. **Add your mod files** (mod.js, styles, config, etc.)
4. **Optional: Add a cover image** (PNG/JPG/WebP)
5. **Submit via GitHub Pull Request**


## manifest.json Template

```json
{
  "name": "My Awesome Mod",
  "version": "1.0.0",
  "author": "Your Name",
  "description": "What your mod does",
  "license": "MIT",
  "keywords": ["gameplay"],
  "subwayBuilderVersion": ">=1.0.0",
  "cover": "cover.png"
}
```
