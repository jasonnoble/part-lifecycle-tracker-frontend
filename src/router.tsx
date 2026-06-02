import { createBrowserRouter } from "react-router";
import Layout from "./Layout";
import PartsList from "./screens/PartsList";
import PartDetail from "./screens/PartDetail";
import WorkOrdersList from "./screens/WorkOrdersList";
import WorkOrderDetail from "./screens/WorkOrderDetail";
import InstanceDetail from "./screens/InstanceDetail";
import CustomerOrders from "./screens/CustomerOrders";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: WorkOrdersList },         // Assembly Line = home tab
      { path: "work-orders/:id", Component: WorkOrderDetail },
      { path: "parts", Component: PartsList },
      { path: "parts/:partNumber", Component: PartDetail },
      { path: "instances/:serial", Component: InstanceDetail },
      { path: "sales", Component: CustomerOrders },
    ],
  },
]);