# Changelog

## Beta 2.5.0

### Identity and navigation
- Renamed the platform to **Brentwood English**.
- TOEFL Practice now contains Full Simulation, Section Practice, and Deep Practice.
- Renamed Intensive Training to Deep Practice.

### Content reset
- Removed the prior student-facing simulation generation.
- Added new Full Simulation 01–03.
- Added Deep Practice 01–03.
- Corrected Full Simulation 03 Reading Module 1 Complete-the-Words to contain 10 blanks using the supplied tenth sentence.

### Test architecture
- Reading: 40 fixed items, two 20-item modules.
- Listening: 34 fixed items, 18 + 16 modules.
- Writing: 10 Build a Sentence + Email + Academic Discussion.
- Speaking: 7 Listen and Repeat + 4 Interview.

### UX
- Compact exam workstation instead of vertically expansive pages.
- Stable header/footer controls and internal scrolling panes.
- Reading split-pane layout.
- Daily Life email/notice/message renderers.
- Fixed Writing prompt/editor layout.
- Drag-and-drop Build a Sentence with touch/click fallback.
- Light, Dark, and System appearance modes.

### Audio and Speaking
- Added 103 MP3 assets across hardware check, Listening, and Speaking.
- Added explicit audio playback checks and retry states.
- Added microphone signal test, short recording, and playback confirmation.
- Added mobile-oriented explicit user-triggered audio playback.
- Speaking recordings persist locally and upload to shared storage when deployed.

### Deep Practice
- Session-based flow instead of a menu of individual teaching mechanics.
- One main activity at a time.
- Supports timed Reading/comprehension/vocabulary/build/prompt abstraction/Writing/repair/rewrite/transfer combinations.
- Normalized correction categories across sessions.
- Complete Deep Practice production appears in Results and Teacher Dashboard.

### Persistence and Teacher
- Added Netlify Functions + Netlify Blobs attempt persistence.
- Added shared Speaking recording storage.
- Added functional Teacher Dashboard with student search, performance summary, item review, production, audio playback, scores, and notes.
- Authentication intentionally deferred; no fake login screen is included.
