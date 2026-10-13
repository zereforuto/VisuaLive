import { NavLink } from "react-router-dom";

const links = [
  { to: "/media", label: "Media Recognition", icon: ">" },
  { to: "/", label: "Dashboard", icon: "▦" },
  { to: "/live", label: "Live Recognition", icon: "◉" },
  { to: "/system", label: "System", icon: "◌" },
  { to: "/dataset", label: "Dataset", icon: "▤" },
];

const navigationOrder = ["/", "/live", "/media", "/system", "/dataset"];

export default function Sidebar() {
  return (
    <header className="sticky top-0 z-30 pt-4 pb-2">
      <div className="mx-auto flex max-w-fit items-center justify-center">
        <nav
          className="flex items-center gap-1 rounded-2xl border border-white/[0.08] bg-[#0c1017]/80 p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
          aria-label="Primary navigation"
        >
          {[...links].sort((a, b) => navigationOrder.indexOf(a.to) - navigationOrder.indexOf(b.to)).map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-300 ease-out ${
                  isActive
                    ? "border border-white/20 bg-[#161c28] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_4px_16px_rgba(0,0,0,0.3)]"
                    : "border border-transparent text-white/50 hover:bg-white/[0.04] hover:text-white/90"
                }`
              }
            >
              <span className="text-xs opacity-75">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
