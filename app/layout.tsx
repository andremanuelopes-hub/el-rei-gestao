import './style.css';
export const metadata = { title: 'El Rei Gestão', description: 'Gestão interna da pastelaria El Rei' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt"><body>{children}</body></html>; }
