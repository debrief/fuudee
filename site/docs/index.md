# Debrief v4

Debrief helps analysts turn the record of an exercise or deployment into understanding: reconstructing tracks, measuring geometry, annotating what happened, and producing reports whose every figure traces back to its data.

Debrief v4 replaces the 25-year-old Eclipse application with one shared core that every community uses: a VS Code extension, analysis tools written in Python, and plots stored as plain GeoJSON in STAC catalogues with their provenance inside.

<p><a class="md-button md-button--primary" href="demo/">Open the web demo</a></p>

The **web demo** is Debrief running full screen in your browser, on the sample exercise, with five walkthroughs to start you off. Files of your own open too: they are read in your browser only, never sent anywhere, and gone when you close the tab.

The **[review copy](https://fuudee3-23386745414e.herokuapp.com/)** is VS Code itself, with the Debrief extension, running on Heroku and built from `main`. It needs no WebAssembly, so it works where the web demo cannot start. It is for invited reviewers: it asks for a password, which the team gives you. Every reviewer shares one workspace, it resets at least daily, and any file you open in it is uploaded to Heroku, so open sample data only.

- **[Blog](blog/index.md)**: short posts as each capability lands.
- **[Guides](guides/index.md)**: the style guide, interaction models and tool-author guide that keep Debrief consistent as it grows.

Development happens in the open at [debrief/fuudee](https://github.com/debrief/fuudee). Everything on this site uses unclassified sample data only.
