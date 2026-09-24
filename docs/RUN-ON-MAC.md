# Run the site on your Mac

You only need to do steps 1–3 once.

1. **Install Node.js.** Go to https://nodejs.org, download the **LTS** version, and run the installer.
2. **Get the code.** In GitHub Desktop, clone `MacherThomas/EdTech-Hivemind`. At the top, check that **Current Branch** says `claude/ie-community-study-platform-scasx8`. If it doesn't, click it and pick that branch.
3. **Open a Terminal in the project.** In GitHub Desktop: menu **Repository → Open in Terminal**. Type this and press Enter (it takes a few minutes the first time):

   ```
   npm install
   ```

## Start the site

In that Terminal window, type:

```
npm run local
```

When it says **Ready**, open http://localhost:3000 in your browser.

- **Signing in:** use any `@student.ie.edu` address, for example `demo.ana@student.ie.edu` (a demo tutor) or your own. No real email is sent: the 6-digit code appears in the Terminal window, after `sign-in code is`.
- **Stopping:** click the Terminal window and press **Ctrl + C**.
- **Next time:** open the Terminal the same way and just run `npm run local`. Your data is kept between runs, in a hidden `.local-db` folder inside the project.

## Getting updates

When new changes are pushed: in GitHub Desktop click **Fetch origin**, then **Pull origin**. In the Terminal run `npm install`, then `npm run local`.

## Starting over

To wipe your local data and start fresh, stop the site, delete the `.local-db` folder in the project, and run `npm run local` again.
