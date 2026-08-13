# Brentwood English — Beta 2.5.0

Major rebuild of the Brentwood English TOEFL practice platform.

## Student areas

- **Full Simulation** — 3 new fixed simulations.
- **Section Practice** — Reading, Listening, Writing, or Speaking pulled from those same simulation banks.
- **Deep Practice** — 3 guided production/correction/transfer sessions.

## Fixed simulation structure

- Reading: 40 items, two modules (10 Complete the Words + 5 Daily Life + 5 Academic per module).
- Listening: 34 items, two modules (18 + 16).
- Writing: 10 Build a Sentence + Email + Academic Discussion.
- Speaking: 7 Listen and Repeat + 4 Interview questions.

## Major 2.5.0 changes

- Platform renamed **Brentwood English**.
- Compact fixed testing workspace with internal pane scrolling.
- Light / Dark / System appearance modes.
- Real MP3 assets are the primary test-audio source; browser speech synthesis is not required.
- Audio and microphone equipment checks before audio-dependent sections.
- Speaking responses are recorded with `MediaRecorder` and kept locally as a fallback.
- Text/answers autosave and can be resumed.
- Timers preserve their absolute end time across refresh/resume.
- Build a Sentence supports desktop drag-and-drop and tap/click fallback for touch devices.
- Full Results preserve auto-scored items and open-ended student production.
- Teacher Dashboard shows stored attempts, item review, Writing/Deep Practice production, Speaking recordings, teacher scores, and notes.

## Teacher Dashboard — important

Beta 2.5.0 intentionally has **no authentication gate**. This is not fake security: there is simply no security layer yet. The dashboard clearly labels itself as development access.

The dashboard is available from the **Teacher** button or `/#/teacher`.

Do not treat the Teacher URL or stored student data as private until authentication is added in a later release.

## Persistence

When deployed through Netlify, completed attempts are stored through Netlify Functions + Netlify Blobs. Speaking recordings are stored separately from the attempt JSON.

If remote storage is unavailable, completed work remains in the student's browser locally and the Results page reports that state.

## Audio

The repository includes **functional synthetic MP3 audio** for all current Listening and Speaking prompts plus the hardware check. These assets are intended to make Beta 2.5.0 fully testable on desktop and mobile immediately. They can later be replaced file-for-file with higher-naturalness recordings without changing the practice engine.

## Deploying

This version should be deployed through the GitHub-connected Netlify project (or Netlify CLI), **not as a static-only Netlify Drop**, because the Teacher Dashboard's shared persistence depends on Netlify Functions and the `@netlify/blobs` package.

Netlify installs the dependency from `package.json` during a normal build/deploy.

See `MIGRATION_FROM_2.4.1.md` before replacing the old repository contents.
