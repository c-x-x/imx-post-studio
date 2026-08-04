import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const root = resolve(process.env.IMX_THEME_ROOT ?? projectRoot)
const sourceCommit = '6f08e8e5bba774a8e1fa0c2fa911c7435dddd9c7'
const sourceFiles = [
  ['LICENSE', '0430d664811b8d60345dbb908f979e088b8f09dcca7bb5ac890c4a087de3c2c7'],
  ['assets/css/fonts.css', '42459d3d6a6898fe31e9dd1dcaa8ba914fcec65abd674f64373b143c5eeba2ff'],
  ['assets/css/tokens.css', 'd67bfdc7803edae8c5b50bb127b1668f0c75cdc6612e0c230b52f06f69ff153d'],
  ['assets/css/base.css', 'e8bd2641016410aeaae982dbdff899cf4f0211e0197a680550bcc4585f8c6cc4'],
  ['assets/css/layout.css', '4bf20e90f3a55c2b29c10d94f0beaeb8079498b6446eb39131e00b4ccb9d15f7'],
  ['assets/css/cards.css', 'da86e692ccb81e71ccdb6f280fa2f655190e40c8ddd0305b0881e0c647f9acc4'],
  ['assets/css/article.css', '0b0595a70bae85bea3cc38f69aaa6560e536b83b7185ea1d3e0375bd29138950'],
  ['assets/css/responsive-content.css', 'f5a6af9b585aaba2c5fbccd2b8cf7837748f49990e94869b11ac67d4266d4136'],
  ['assets/css/article-reading.css', 'ed1632fce0a63f0c5e7f7c875b6a3a21d9d8ef69afb1aed01ac045ff407a286e'],
  ['assets/css/article-reading-responsive.css', 'a7034392509308555ca2831d4161b836162516265b4c9d19aabe525c8c6a388a'],
  ['assets/css/code.css', '8865b456825cda634ed2222ca49f9abf787f44e9f0bf0de2788988d20df12368'],
  ['assets/fonts/imx/inter-variable.woff2', '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3'],
  ['assets/fonts/imx/noto-serif-sc-400-core.woff2', 'd70c4c90898fc4745f1e5550a082d933fcb07bb3ac846ecb49ecd089abf51379'],
  ['assets/fonts/imx/noto-serif-sc-400-common.woff2', 'ed936522eadb6a32b5df199196c968416dda2f153daa5b80ecd1c5d4ca746dd2'],
  ['assets/fonts/imx/noto-serif-sc-400-extended.woff2', 'c07409ffc90fec98311b8dffd7bdc38121b06aa1bff3b317c1ba02d89f3af228'],
  ['assets/fonts/imx/noto-serif-sc-700-core.woff2', '48ebbcf99ff2b28c34926a57b31564da71c98f919daf3c5261528f7ca408e59d'],
  ['assets/fonts/imx/noto-serif-sc-700-common.woff2', '1e936c22005cb9318d5a002eebeafab5bf651f866dbca69404b302de084fc8c7'],
  ['assets/fonts/imx/noto-serif-sc-700-extended.woff2', '6a910bf112c062ae6bbecec50185601a34a333a4c81b7779063f66b0a654a048'],
  ['static/fonts/imx/OFL-Inter.txt', '262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a'],
  ['static/fonts/imx/OFL-Noto-Serif-SC.txt', '07673599d63040a2d00a8735cce78bcf7af54d72e43f6cb5bd3efd8fe227bd28'],
]
const outputFiles = [
  ['src/theme/imx/imx-preview.css', '2aa8834f21449a2f0af58161c0c9d892d67393cad0ef8a06de07a61d52644646'],
  ['src/theme/imx/LICENSE.imx', '0430d664811b8d60345dbb908f979e088b8f09dcca7bb5ac890c4a087de3c2c7'],
  ['src/theme/imx/OFL-Inter.txt', '262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a'],
  ['src/theme/imx/OFL-Noto-Serif-SC.txt', '07673599d63040a2d00a8735cce78bcf7af54d72e43f6cb5bd3efd8fe227bd28'],
  ['public/imx/fonts/inter-variable.woff2', '693b77d4f32ee9b8bfc995589b5fad5e99adf2832738661f5402f9978429a8e3'],
  ['public/imx/fonts/noto-serif-sc-400-core.woff2', 'd70c4c90898fc4745f1e5550a082d933fcb07bb3ac846ecb49ecd089abf51379'],
  ['public/imx/fonts/noto-serif-sc-400-common.woff2', 'ed936522eadb6a32b5df199196c968416dda2f153daa5b80ecd1c5d4ca746dd2'],
  ['public/imx/fonts/noto-serif-sc-400-extended.woff2', 'c07409ffc90fec98311b8dffd7bdc38121b06aa1bff3b317c1ba02d89f3af228'],
  ['public/imx/fonts/noto-serif-sc-700-core.woff2', '48ebbcf99ff2b28c34926a57b31564da71c98f919daf3c5261528f7ca408e59d'],
  ['public/imx/fonts/noto-serif-sc-700-common.woff2', '1e936c22005cb9318d5a002eebeafab5bf651f866dbca69404b302de084fc8c7'],
  ['public/imx/fonts/noto-serif-sc-700-extended.woff2', '6a910bf112c062ae6bbecec50185601a34a333a4c81b7779063f66b0a654a048'],
]

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex') }
function safeProjectPath(path) {
  const resolved = resolve(root, path)
  const fromRoot = relative(root, resolved)
  return !isAbsolute(fromRoot) && !fromRoot.startsWith('..') && resolved !== root
}
function exactEntries(entries, expected, label) {
  if (!Array.isArray(entries) || entries.length !== expected.length) throw new Error(`Theme manifest has an unexpected ${label} set`)
  for (let index = 0; index < expected.length; index += 1) {
    const entry = entries[index]
    const [path, hash] = expected[index]
    if (!entry || Object.keys(entry).length !== 2 || !Object.hasOwn(entry, 'path') || !Object.hasOwn(entry, 'sha256') || entry.path !== path || entry.sha256 !== hash) throw new Error(`Theme manifest ${label} entry mismatch: ${path}`)
  }
}
async function physicalPaths() {
  const theme = await readdir(resolve(root, 'src/theme/imx'))
  const fonts = await readdir(resolve(root, 'public/imx/fonts'))
  return [
    ...theme.map((name) => `src/theme/imx/${name}`),
    ...fonts.map((name) => `public/imx/fonts/${name}`),
  ].sort()
}

async function main() {
  const manifest = JSON.parse(await readFile(resolve(root, 'src/theme/imx/theme-manifest.json'), 'utf8'))
  const keys = ['schemaVersion', 'repository', 'version', 'commit', 'sourceCommit', 'syncedAt', 'sourceFiles', 'files']
  if (Object.keys(manifest).length !== keys.length || !keys.every((key) => Object.hasOwn(manifest, key))) throw new Error('Theme manifest schema is invalid')
  if (manifest.schemaVersion !== 1 || manifest.repository !== 'https://github.com/c-x-x/hugo-theme-imx' || manifest.version !== 'v1.4.9' || manifest.commit !== '6f08e8e' || manifest.sourceCommit !== sourceCommit || manifest.syncedAt !== '2026-07-28T18:55:29+08:00') throw new Error('Theme manifest provenance does not match the approved IMX baseline')
  exactEntries(manifest.sourceFiles, sourceFiles, 'source-file')
  exactEntries(manifest.files, outputFiles, 'copied-file')
  for (const entry of manifest.files) {
    if (!safeProjectPath(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`Theme manifest rejected file path: ${entry.path}`)
    if (sha256(await readFile(resolve(root, entry.path))) !== entry.sha256) throw new Error(`Theme asset hash mismatch: ${entry.path}`)
  }
  const expectedPhysical = [...outputFiles.map(([path]) => path), 'src/theme/imx/theme-manifest.json'].sort()
  if (JSON.stringify(await physicalPaths()) !== JSON.stringify(expectedPhysical)) throw new Error('Vendored IMX files do not exactly match the manifest')
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
