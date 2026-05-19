// For Capacitor builds, NEXT_PUBLIC_API_BASE points to the deployed server.
// For web builds, it's empty — fetch uses relative URLs.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";
