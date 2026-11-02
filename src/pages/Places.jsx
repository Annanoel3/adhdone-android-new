import { Navigate } from "react-router-dom";

// Places moved into Settings Nov 2 2026 (Anna: "we can move places into
// settings"). The cards live in src/components/places/PlacesSection.jsx; this
// route stays so the commute push (screen '/Places') and old links still work.
export default function Places() {
  return <Navigate to="/settings?section=places" replace />;
}
