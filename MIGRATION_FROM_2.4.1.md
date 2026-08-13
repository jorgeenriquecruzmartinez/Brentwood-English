# Replacing Beta 2.4.1 with Beta 2.5.0

Beta 2.5.0 is a **full replacement**, not an update pack.

## In the existing local GitHub repository

1. Keep the hidden `.git` folder.
2. Delete the old project files/folders from the repository working directory. Do **not** delete `.git`.
3. Extract the Beta 2.5.0 ZIP.
4. Copy the **contents** of the extracted Beta 2.5.0 folder into the repository root.
5. Check Git status. You should see old files deleted and the new files added/changed.
6. Commit the replacement.
7. Push the same production branch to GitHub.
8. Let the existing GitHub-connected Netlify project perform its normal build/deploy.

Do not place the entire `brentwood-english-2.5.0` folder inside the old repository as a nested folder.

## Why a normal Netlify build matters

The static interface will open without the backend, but shared Teacher Dashboard data requires the two functions under `netlify/functions/` and the dependency in `package.json`.

After deployment, complete one short test attempt, open **Teacher**, press **Refresh**, and confirm that the attempt appears. Then test a Speaking attempt and confirm remote recording playback.
