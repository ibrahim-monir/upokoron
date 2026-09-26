/**
 * A product video link, understood.
 *
 * Videos are linked, not uploaded: a phone video is tens of megabytes, which
 * shared hosting serves slowly and fills up fast, while YouTube streams it
 * free at whatever quality the viewer's connection can take.
 *
 * Accepts the YouTube shapes people actually paste -- watch?v=, youtu.be/,
 * /shorts/, /embed/ -- and a direct .mp4 or .webm file. Returns null for
 * anything else, so a bad link shows nothing rather than a broken player.
 */
export function parseVideo(url) {
  if (!url || typeof url !== 'string') return null

  let parsed

  try {
    parsed = new URL(url.trim())
  } catch {
    return null
  }

  const host = parsed.hostname.replace(/^www\.|^m\./, '')
  let id = null

  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1).split('/')[0]
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      id = parsed.searchParams.get('v')
    } else {
      const match = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/)
      id = match?.[1] ?? null
    }
  }

  if (id && /^[A-Za-z0-9_-]{6,20}$/.test(id)) {
    return {
      kind: 'youtube',
      id,
      // The privacy-enhanced domain: no YouTube cookies until the visitor
      // presses play.
      embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    }
  }

  if (/^https?:$/.test(parsed.protocol) && /\.(mp4|webm)$/i.test(parsed.pathname)) {
    return { kind: 'file', src: parsed.href, thumbnail: null }
  }

  return null
}
