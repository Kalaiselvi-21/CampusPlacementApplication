import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

const NavigationGuard = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  useEffect(() => {
    // Auto logout when authenticated user visits login page
    if (user && location.pathname === "/login") {
      console.log("=== AUTO LOGOUT ===");
      console.log("Authenticated user on login page - logging out");
      logout();
      return;
    }
  }, [location.pathname, user, logout]);

  useEffect(() => {
    // Handle browser back button navigation only
    const handlePopState = (event) => {
      console.log("=== NAVIGATION GUARD DEBUG ===");
      console.log("Current location:", location.pathname);
      console.log("User authenticated:", !!user);

      // Only handle back button navigation to register page, not login (handled above)
      if (user && location.pathname === "/register") {
        const dashboardRoute =
          user.role === "student"
            ? "/dashboard"
            : user.role === "placement_officer" || user.role === "po"
            ? "/po-dashboard"
            : user.role === "pr" || user.role === "placement_representative"
            ? "/pr-dashboard"
            : "/dashboard";
        navigate(dashboardRoute, { replace: true });
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [location, user, navigate, logout]);

  return null;
};

export default NavigationGuard;
