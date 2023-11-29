/* eslint-disable */
const plugins = [
  '@semantic-release/commit-analyzer',
  '@semantic-release/release-notes-generator',
  '@semantic-release/changelog',
  '@semantic-release/npm',
  [
    '@semantic-release/git',
    {
      assets: ['CHANGELOG.md', 'dist/**/*.{js,css}', 'docs', 'package.json'],
      message:
        'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
    },
  ],
]

if (process?.env?.CI) {
  plugins.push([
    'semantic-release-slack-bot',
    {
      notifyOnSuccess: true,
      notifyOnFail: true,
      packageName: require('./package.json').name,
    },
  ])
}

module.exports = {
  branches: ['master', 'next', { name: 'beta', prerelease: true }],
  plugins,
}
