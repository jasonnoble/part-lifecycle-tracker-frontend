import { createBrowserRouter, Outlet } from "react-router";
import Layout from "./Layout";
import { AuthProvider } from "./auth/AuthProvider";
import RequireAuth from "./auth/RequireAuth";
import Login from "./screens/Login";
import Authenticate from "./screens/Authenticate";
import PartsList from "./screens/PartsList";
import PartDetail from "./screens/PartDetail";
import WorkOrdersList from "./screens/WorkOrdersList";
import WorkOrderDetail from "./screens/WorkOrderDetail";
import InstanceDetail from "./screens/InstanceDetail";
import CustomerOrders from "./screens/CustomerOrders";

export const router = createBrowserRouter([
  {
    // Pathless layout so AuthProvider lives *inside* the router (it uses
    // useNavigate) and wraps every route, public and protected alike.
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      // Public auth routes (no session required).
      { path: "/login", Component: Login },
      { path: "/authenticate", Component: Authenticate },
      // The app shell + all screens require a session.
      {
        path: "/",
        element: (
          <RequireAuth>
            <Layout />
          </RequireAuth>
        ),
        children: [
          { index: true, Component: WorkOrdersList },         // Assembly Line = home tab
          { path: "work-orders/:id", Component: WorkOrderDetail },
          { path: "parts", Component: PartsList },
          { path: "parts/:partNumber", Component: PartDetail },
          { path: "instances/:serial", Component: InstanceDetail },
          { path: "sales", Component: CustomerOrders },
        ],
      },
    ],
  },
]);