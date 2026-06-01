import { NavLink, Outlet } from "react-router";
import RoleSelector from "./RoleSelector.tsx";

export default function Layout() {
    return (
        <>
            <header className="text-3xl font-bold text-blue-600">
                <nav>
                    <NavLink to="/">Assembly Line</NavLink>
                    <NavLink to="/parts">Parts</NavLink>
                    <NavLink to="/sales">Sales</NavLink>
                </nav>
                <RoleSelector />
            </header>
            <main>
                <Outlet />          {/* the matched child route renders here */}
            </main>
        </>
    );
}