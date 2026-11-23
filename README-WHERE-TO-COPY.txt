Nurse app UI fix: where each file goes
Unzip this over your project root (the folder that contains nurse/, admin/, backend/).
Each file replaces the one at the same path:

nurse/src/app/AppShell.tsx                          (sync bar is now one tappable row)
nurse/src/features/careforms/HomeSummaryCard.tsx    (Open Documents is now a pill button)
nurse/src/copy.ts                                   ("waiting to sync" wording)
nurse/src/styles.css                                (new styles added at the end of the file)

Then, from the nurse/ folder: npm run build, then rebuild the APK / publish the web bundle.
