# Property Tax Reform Map

**[Open the live map](https://taxmap.limsight.com/)** to explore how an illustrative property-tax reform could affect a typical home in England.

Compare Council Tax with an annual property tax, starting at **0.48%**. Change the rate, include Stamp Duty, enter your own figures, or share a result. Calculations run in your browser using pinned official data.

![Tax Map showing the England map and a Leicester comparison](docs/images/tax-map.png)

## Run locally

1. Install Node.js **22.14.0 or newer**.
2. Install dependencies and start the app:

   ```sh
   npm ci
   npm run dev
   ```

3. Open the local URL printed by Vite. Try postcode **LE4 0DD**.

The website uses the data committed to this repository. No API keys, Python setup or private source archive are needed to run it.

## Check your changes

```sh
npm run check
npm test
npm run test:app
npm run test:deployment
npm run build
```

For browser tests, install Chromium once with `npx playwright install chromium`, then run `npm run test:browser` after building. Preview the production build with `npm run preview`.

Pull requests and pushes to `main` run the website checks automatically. Publishing uses the separate, manually started deployment workflow. See the [deployment guide](docs/deployment.md).

## Understand the results

The current release covers **296 councils and 6,856 neighbourhoods (MSOAs)** in England. Estimates are available for **293 councils and 2,961 neighbourhoods**. Areas with missing or invalid inputs remain unavailable.

This is an illustrative reform scenario, not enacted policy or personal tax advice. The figures use dated sources and area estimates; they are not property valuations or individual tax bills. Northern Ireland postcode records are excluded from the distributed data.

Read the [methodology](docs/methodology.md) for assumptions and the [source register](docs/source-register.md) for sources. To rebuild datasets, follow the separate [Python pipeline guide](pipeline/README.md); the original raw downloads and source archive are not included in a clone.

## Licences

Original project code and documentation are licensed under the [MIT Licence](LICENSE).

Third-party datasets, derived data, map geometry and dependencies retain their own licences. MIT does not replace those terms. See [data licences and attribution](DATA-LICENSES.md) before reusing data or map assets.

## Contribute

Follow the [contribution guide](CONTRIBUTING.md) for code changes or [open an issue](https://github.com/Lionel-Lim/tax-map/issues) for a bug or data correction. Report security issues using the [security guide](SECURITY.md).
