const fs = require('fs');
const path = require('path');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Turn any image into an editable, multicolor 3MF bead relief — locally in your browser."
    />
    <title>Pingdou — Image to editable multicolor 3MF</title>
    <link rel="canonical" href="https://pgp00.github.io/pingdou/" />
    <link rel="stylesheet" href="./styles.css" />
    <script type="importmap">
      {
        "imports": {
          "three": "./vendor/three.module.js"
        }
      }
    </script>
  </head>
  <body>
    <div id="root"></div>
    <script src="./vendor/react.production.min.js"></script>
    <script src="./vendor/react-dom.production.min.js"></script>
    <script type="module" src="./src/main.js"></script>
  </body>
</html>
`;

fs.writeFileSync(path.join(process.cwd(), 'generated', 'dist', 'index.html'), html);
