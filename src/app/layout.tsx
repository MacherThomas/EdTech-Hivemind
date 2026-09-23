import type { Metadata } from "next";
import { Montserrat, PT_Serif } from "next/font/google";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { signOut } from "./actions/auth";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-montserrat" });
const ptSerif = PT_Serif({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-ptserif" });

export const metadata: Metadata = {
  title: { default: "IE Study Hivemind", template: "%s · IE Study Hivemind" },
  description: "Community-led study spaces for IE University courses.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="en" className={`${montserrat.variable} ${ptSerif.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to main content</a>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://static.ie.edu/IT/logos/Corporate/Logo_Corporate_Blue_Filled.svg" alt="IE University" height={60} />
              <span>Study Hivemind</span>
            </Link>
            {user?.displayName && (
              <nav className="site-nav" aria-label="Main">
                <Link href="/">Home</Link>
                <Link href="/courses">Courses</Link>
                <Link href="/tutoring">Tutoring</Link>
                <Link href="/profile">{user.displayName}</Link>
                <form action={signOut}>
                  <button type="submit" className="btn btn-ghost btn-small">Sign out</button>
                </form>
              </nav>
            )}
          </div>
        </header>
        <main id="main" className="container" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <div className="container small muted">
            Student-run study spaces. Content is written by students. Not an official channel for grades or academic records.
          </div>
        </footer>
      </body>
    </html>
  );
}
