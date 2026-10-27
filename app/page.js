import Mountains from '../components/Mountains';

const LINKS = [
  { label: 'Plex', href: 'https://plex.mountainlab.net' },
  { label: 'Requests', href: 'https://request.mountainlab.net' },
];

export default function Home() {
  return (
    <Mountains>
      <header className="chrome chrome-top">
        <h1 className="mark">MountainLab</h1>
        <nav className="nav">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
              <span aria-hidden="true">↗</span>
            </a>
          ))}
        </nav>
      </header>
    </Mountains>
  );
}
