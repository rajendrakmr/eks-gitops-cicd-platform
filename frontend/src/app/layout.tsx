import type { Metadata } from 'next';
import './globals.css';
import StoreProvider from '@/components/StoreProvider';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'ShopStream: modern online store',
  description: 'A polyglot microservices e-commerce demo: Next.js, Go, Python and Node.js.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <Navbar />
          <main>{children}</main>
          <footer className="footer">
            <div className="container row-between">
              <span>© {new Date().getFullYear()} ShopStream</span>
              <span className="muted small">Next.js · Redux Toolkit · Node.js · Go · Python · Postgres · MongoDB · Redis</span>
            </div>
          </footer>
        </StoreProvider>
      </body>
    </html>
  );
}
