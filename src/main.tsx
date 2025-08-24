import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import "non.geist";
import "./index.css";
import App from "./App";
import StartingPage from "./StartingPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <StartingPage />,
  },
  {
    path: "/editor",
    element: (
      <ProtectedRoute requireAuth={true}>
        <App />
      </ProtectedRoute>
    ),
  },
  {
    path: "/editor/:projectId",
    element: (
      <ProtectedRoute requireAuth={true}>
        <App />
      </ProtectedRoute>
    ),
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <RouterProvider router={router} />
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>,
);
