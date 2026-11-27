/** Where an address can be shared to, for a browser that has no share dialog of its own. */
export class ShareLinks {
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
