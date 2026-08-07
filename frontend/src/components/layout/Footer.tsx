import { Hammer, Github, Globe } from "lucide-react";
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-slate-950/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-white/40">
            <Hammer className="w-4 h-4 text-ochre-400" />
            <span className="font-medium">UrithiBidz</span>
            <span>— African Art Auctions on Stellar</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-white/40">
            <Link
              href="https://stellar.org"
              target="_blank"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              Stellar
            </Link>
            <Link
              href="https://github.com/StellarUrithi-Bidz/StellarUrithi-Bidz"
              target="_blank"
              className="flex items-center gap-1.5 hover:text-white transition-colors"
            >
              <Github className="w-3.5 h-3.5" />
              Open Source
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
