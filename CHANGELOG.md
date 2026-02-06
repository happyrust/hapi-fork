# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- Session action menu with resume functionality
- Localization updates (en, zh-CN)

### Changed
- Merged upstream tiann/hapi v0.15.1

### Fixed
- Windows compatibility: use absolute path with `shell: false` for Claude spawn

## [0.15.1] - 2026-02-06

### Fixed
- Windows: use absolute path with shell:false for Claude spawn (#143)
- Web: fix message order issue when switching sessions (#150)

### Changed
- CI(web): enable VITE_REQUIRE_HUB_URL for pages build
- Web: require hub URL without clearing input

### Docs
- Update Cloudflare Tunnel section and add relay TCP configuration tip
- Add CONTRIBUTING.md with contributor guidelines
