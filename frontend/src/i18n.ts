import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  en: {
    translation: {
      // Navigation
      "nav.dashboard": "Dashboard",
      "nav.alerts": "Alerts",
      "nav.analytics": "Analytics",
      "nav.patients": "Patients",
      "nav.map": "Live Map",
      "nav.status": "Hospital Status",
      "nav.profile": "Profile",
      "nav.sos": "SOS",
      "nav.logout": "Logout",
      "nav.login": "Login",
      "nav.register": "Register",

      // Dashboard
      "dashboard.title": "TMT Dashboard",
      "dashboard.welcome": "Welcome back",
      "dashboard.totalPatients": "Total Patients",
      "dashboard.activeAlerts": "Active Alerts",
      "dashboard.hospitals": "Hospitals",
      "dashboard.sosRequests": "SOS Requests",

      // Alerts
      "alerts.title": "Alerts",
      "alerts.new": "New Alert",
      "alerts.acknowledge": "Acknowledge",
      "alerts.severity": "Severity",
      "alerts.type": "Type",
      "alerts.location": "Location",
      "alerts.time": "Time",
      "alerts.noAlerts": "No active alerts",

      // Patients
      "patients.title": "Patients",
      "patients.search": "Search patients...",
      "patients.name": "Name",
      "patients.phone": "Phone",
      "patients.status": "Status",
      "patients.location": "Location",
      "patients.mobility": "Mobility",

      // Map
      "map.title": "Live Map",
      "map.layers": "Layers",
      "map.timeRange": "Time Range",
      "map.events": "Events",
      "map.layer.crisis": "Crisis Events",
      "map.layer.sos": "SOS Requests",
      "map.layer.hospital": "Hospitals",
      "map.layer.sms_activity": "SMS Activity",
      "map.layer.patient_density": "Patient Density",
      "map.layer.telegram_intel": "Telegram Intel",

      // SOS
      "sos.title": "Emergency SOS",
      "sos.send": "Send SOS",
      "sos.sending": "Sending...",
      "sos.sent": "SOS Sent Successfully",
      "sos.offline": "You are offline. SOS will be sent via SMS.",
      "sos.status": "Your Status",
      "sos.severity": "Severity Level",

      // Hospital
      "hospital.status": "Hospital Status",
      "hospital.beds": "Available Beds",
      "hospital.icu": "ICU Beds",
      "hospital.supplies": "Supply Levels",

      // Auth
      "auth.login": "Login",
      "auth.register": "Register",
      "auth.phone": "Phone Number",
      "auth.password": "Password",
      "auth.email": "Email",
      "auth.role": "Role",
      "auth.loginButton": "Sign In",
      "auth.registerButton": "Create Account",

      // Common
      "common.loading": "Loading...",
      "common.error": "An error occurred",
      "common.save": "Save",
      "common.cancel": "Cancel",
      "common.delete": "Delete",
      "common.edit": "Edit",
      "common.back": "Back",
      "common.offline": "You are currently offline",
      "common.online": "Back online",
      "common.language": "Language",
    },
  },
  ar: {
    translation: {
      // Navigation
      "nav.dashboard": "\u0644\u0648\u062d\u0629 \u0627\u0644\u0642\u064a\u0627\u062f\u0629",
      "nav.alerts": "\u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a",
      "nav.analytics": "\u0627\u0644\u062a\u062d\u0644\u064a\u0644\u0627\u062a",
      "nav.patients": "\u0627\u0644\u0645\u0631\u0636\u0649",
      "nav.map": "\u0627\u0644\u062e\u0631\u064a\u0637\u0629 \u0627\u0644\u062d\u064a\u0629",
      "nav.status": "\u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u0633\u062a\u0634\u0641\u0649",
      "nav.profile": "\u0627\u0644\u0645\u0644\u0641 \u0627\u0644\u0634\u062e\u0635\u064a",
      "nav.sos": "\u0637\u0648\u0627\u0631\u0626",
      "nav.logout": "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062e\u0631\u0648\u062c",
      "nav.login": "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644",
      "nav.register": "\u062a\u0633\u062c\u064a\u0644",

      // Dashboard
      "dashboard.title": "\u0644\u0648\u062d\u0629 \u0642\u064a\u0627\u062f\u0629 TMT",
      "dashboard.welcome": "\u0645\u0631\u062d\u0628\u0627 \u0628\u0639\u0648\u062f\u062a\u0643",
      "dashboard.totalPatients": "\u0625\u062c\u0645\u0627\u0644\u064a \u0627\u0644\u0645\u0631\u0636\u0649",
      "dashboard.activeAlerts": "\u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0627\u0644\u0646\u0634\u0637\u0629",
      "dashboard.hospitals": "\u0627\u0644\u0645\u0633\u062a\u0634\u0641\u064a\u0627\u062a",
      "dashboard.sosRequests": "\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0637\u0648\u0627\u0631\u0626",

      // Alerts
      "alerts.title": "\u0627\u0644\u062a\u0646\u0628\u064a\u0647\u0627\u062a",
      "alerts.new": "\u062a\u0646\u0628\u064a\u0647 \u062c\u062f\u064a\u062f",
      "alerts.acknowledge": "\u062a\u0623\u0643\u064a\u062f",
      "alerts.severity": "\u0627\u0644\u062e\u0637\u0648\u0631\u0629",
      "alerts.type": "\u0627\u0644\u0646\u0648\u0639",
      "alerts.location": "\u0627\u0644\u0645\u0648\u0642\u0639",
      "alerts.time": "\u0627\u0644\u0648\u0642\u062a",
      "alerts.noAlerts": "\u0644\u0627 \u062a\u0648\u062c\u062f \u062a\u0646\u0628\u064a\u0647\u0627\u062a \u0646\u0634\u0637\u0629",

      // Patients
      "patients.title": "\u0627\u0644\u0645\u0631\u0636\u0649",
      "patients.search": "\u0628\u062d\u062b \u0639\u0646 \u0645\u0631\u064a\u0636...",
      "patients.name": "\u0627\u0644\u0627\u0633\u0645",
      "patients.phone": "\u0627\u0644\u0647\u0627\u062a\u0641",
      "patients.status": "\u0627\u0644\u062d\u0627\u0644\u0629",
      "patients.location": "\u0627\u0644\u0645\u0648\u0642\u0639",
      "patients.mobility": "\u0627\u0644\u062d\u0631\u0643\u0629",

      // Map
      "map.title": "\u0627\u0644\u062e\u0631\u064a\u0637\u0629 \u0627\u0644\u062d\u064a\u0629",
      "map.layers": "\u0627\u0644\u0637\u0628\u0642\u0627\u062a",
      "map.timeRange": "\u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u0632\u0645\u0646\u064a",
      "map.events": "\u0627\u0644\u0623\u062d\u062f\u0627\u062b",
      "map.layer.crisis": "\u0623\u062d\u062f\u0627\u062b \u0627\u0644\u0623\u0632\u0645\u0627\u062a",
      "map.layer.sos": "\u0637\u0644\u0628\u0627\u062a \u0627\u0644\u0637\u0648\u0627\u0631\u0626",
      "map.layer.hospital": "\u0627\u0644\u0645\u0633\u062a\u0634\u0641\u064a\u0627\u062a",
      "map.layer.sms_activity": "\u0646\u0634\u0627\u0637 \u0627\u0644\u0631\u0633\u0627\u0626\u0644",
      "map.layer.patient_density": "\u0643\u062b\u0627\u0641\u0629 \u0627\u0644\u0645\u0631\u0636\u0649",
      "map.layer.telegram_intel": "\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u062a\u064a\u0644\u064a\u062c\u0631\u0627\u0645",

      // SOS
      "sos.title": "\u0637\u0648\u0627\u0631\u0626 SOS",
      "sos.send": "\u0625\u0631\u0633\u0627\u0644 \u0637\u0648\u0627\u0631\u0626",
      "sos.sending": "\u062c\u0627\u0631\u064a \u0627\u0644\u0625\u0631\u0633\u0627\u0644...",
      "sos.sent": "\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0648\u0627\u0631\u0626 \u0628\u0646\u062c\u0627\u062d",
      "sos.offline": "\u0623\u0646\u062a \u063a\u064a\u0631 \u0645\u062a\u0635\u0644. \u0633\u064a\u062a\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0648\u0627\u0631\u0626 \u0639\u0628\u0631 \u0631\u0633\u0627\u0644\u0629 \u0646\u0635\u064a\u0629.",
      "sos.status": "\u062d\u0627\u0644\u062a\u0643",
      "sos.severity": "\u0645\u0633\u062a\u0648\u0649 \u0627\u0644\u062e\u0637\u0648\u0631\u0629",

      // Hospital
      "hospital.status": "\u062d\u0627\u0644\u0629 \u0627\u0644\u0645\u0633\u062a\u0634\u0641\u0649",
      "hospital.beds": "\u0627\u0644\u0623\u0633\u0631\u0651\u0629 \u0627\u0644\u0645\u062a\u0627\u062d\u0629",
      "hospital.icu": "\u0623\u0633\u0631\u0651\u0629 \u0627\u0644\u0639\u0646\u0627\u064a\u0629 \u0627\u0644\u0645\u0631\u0643\u0632\u0629",
      "hospital.supplies": "\u0645\u0633\u062a\u0648\u064a\u0627\u062a \u0627\u0644\u0625\u0645\u062f\u0627\u062f",

      // Auth
      "auth.login": "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644",
      "auth.register": "\u062a\u0633\u062c\u064a\u0644",
      "auth.phone": "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062a\u0641",
      "auth.password": "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631",
      "auth.email": "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a",
      "auth.role": "\u0627\u0644\u062f\u0648\u0631",
      "auth.loginButton": "\u062f\u062e\u0648\u0644",
      "auth.registerButton": "\u0625\u0646\u0634\u0627\u0621 \u062d\u0633\u0627\u0628",

      // Common
      "common.loading": "\u062c\u0627\u0631\u064a \u0627\u0644\u062a\u062d\u0645\u064a\u0644...",
      "common.error": "\u062d\u062f\u062b \u062e\u0637\u0623",
      "common.save": "\u062d\u0641\u0638",
      "common.cancel": "\u0625\u0644\u063a\u0627\u0621",
      "common.delete": "\u062d\u0630\u0641",
      "common.edit": "\u062a\u0639\u062f\u064a\u0644",
      "common.back": "\u0631\u062c\u0648\u0639",
      "common.offline": "\u0623\u0646\u062a \u063a\u064a\u0631 \u0645\u062a\u0635\u0644 \u062d\u0627\u0644\u064a\u0627",
      "common.online": "\u0639\u062f\u062a \u0645\u062a\u0635\u0644\u0627",
      "common.language": "\u0627\u0644\u0644\u063a\u0629",
    },
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: localStorage.getItem("tmt-language") || "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

// Update HTML dir attribute when language changes
i18n.on("languageChanged", (lng) => {
  document.documentElement.dir = lng === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = lng;
  localStorage.setItem("tmt-language", lng);
});

// Set initial direction
document.documentElement.dir = i18n.language === "ar" ? "rtl" : "ltr";
document.documentElement.lang = i18n.language;

export default i18n;
