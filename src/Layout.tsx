import { NavLink, Outlet } from "react-router";

export default function Layout() {
    return (
        <>
            <header>
                <nav>
                    <NavLink to="/">Assembly Line</NavLink>
                    <NavLink to="/parts">Parts</NavLink>
                    <NavLink to="/sales">Sales</NavLink>
                </nav>
                {/* role-selector dropdown goes here in Step 3 */}
            </header>
            <main>
                <Outlet />          {/* the matched child route renders here */}
            </main>
        </>
    );
}