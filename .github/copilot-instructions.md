# SeaxMusic Project Setup

## Progress Tracking

- [x] Verify copilot-instructions.md file created
- [x] Project requirements clarified - Electron music player with YouTube backend
- [x] Scaffold the Project - Complete structure created
- [x] Customize the Project - UI and backend implemented
- [x] Install Required Extensions - N/A
- [x] Compile the Project - Dependencies installed
- [x] Create and Run Task - Ready to run with npm start
- [ ] Launch the Project
- [x] Ensure Documentation is Complete - README.md created

## Project Details
- **Name**: SeaxMusic
- **Type**: Electron Application
- **Platforms**: PC, Mobile, TV
- **Tech Stack**: Electron, HTML, CSS, JavaScript
- **Architecture**: Main UI window + Hidden backend windows (YouTube player)
- **Theme**: Dark theme with red accents (Spotify-like)

## Project Structure
```
src/
├── main/               # Main process (window management, IPC)
├── renderer/          # UI (HTML, CSS, JS)
├── backend/           # Hidden YouTube player windows
└── preload/           # Preload scripts for IPC security
```
