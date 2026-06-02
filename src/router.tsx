import { createBrowserRouter } from "react-router";
import Layout from "./Layout";
import PartsList from "./screens/PartsList";
import PartDetail from "./screens/PartDetail";
import WorkOrder from "./screens/WorkOrder";
import InstanceDetail from "./screens/InstanceDetail";
import CustomerOrders from "./screens/CustomerOrders";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: WorkOrder },              // Assembly Line = home tab
      { path: "parts", Component: PartsList },
      { path: "parts/:partNumber", Component: PartDetail },
      { path: "instances/:serial", Component: InstanceDetail },
      { path: "sales", Component: CustomerOrders },
    ],
  },
]);