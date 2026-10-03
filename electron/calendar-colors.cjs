const palette = ['#4A5ED5', '#0D9488', '#D97732', '#9B5BCB', '#D14F72', '#4B83B8', '#75913D', '#B3684D']
const validColor = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
function nextColor(sources, profileId) {
  const used = new Set(sources.filter(source => source.profileId === profileId && validColor(source.color)).map(source => source.color.toUpperCase()))
  return palette.find(color => !used.has(color)) || palette[sources.filter(source => source.profileId === profileId).length % palette.length]
}
function ensureColors(sources) {
  const assigned = []
  for (const source of sources) assigned.push({ ...source, color: validColor(source.color) ? source.color.toUpperCase() : nextColor(assigned, source.profileId) })
  return assigned
}
module.exports = { palette, validColor, nextColor, ensureColors }
