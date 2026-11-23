/**
 * What is shared and where. The page that is shared is the address of the page the person is on, except that a round (`/jigsaw/:id/play/:playId`, which is somebody's own game) is shared as
 * the page of its jigsaw (`/jigsaw/:id`), where anybody can look at it and start a round of their own.
 */
export class ShareLinks {
  /** The path to share for the page the person is on (a round is shared as its jigsaw). */
  static pathOf(path: string): string {
    const round = /^(\/jigsaw\/[^/?#]+)\/play\/[^/?#]+/.exec(path);
    return round ? round[1] : path;
  }

  /** The links that open each service with the page ready to be posted. Nothing is sent anywhere until the person presses one. */
  static services(url: string, title: string): { key: 'facebook' | 'x' | 'whatsapp' | 'email'; icon: string; name: string; href: string }[] {
    const u = encodeURIComponent(url);
    const t = encodeURIComponent(title);
    return [
      { key: 'facebook', icon: 'bi-facebook', name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
      { key: 'x', icon: 'bi-twitter-x', name: 'X', href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
      { key: 'whatsapp', icon: 'bi-whatsapp', name: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}` },
      { key: 'email', icon: 'bi-envelope', name: 'E-mail', href: `mailto:?subject=${t}&body=${u}` },
    ];
  }
}
