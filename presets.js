// Preset database of industry acronyms for inspiration and bot players
const ACRONYM_PRESETS = [
  // Tech & Software
  {
    acronym: "API",
    category: "Tech & Software",
    definition: "Application Programming Interface",
    fakeGuesses: [
      "Automated Protocol Integration",
      "Advanced Programming Instructions",
      "Applied Packet Interchange",
      "Asynchronous Program Invocation"
    ]
  },
  {
    acronym: "JSON",
    category: "Tech & Software",
    definition: "JavaScript Object Notation",
    fakeGuesses: [
      "Java Structured Output Network",
      "Joined Syntax Open Notation",
      "Javascript Operational Node",
      "Just Simple Object Network"
    ]
  },
  {
    acronym: "CRUD",
    category: "Tech & Software",
    definition: "Create, Read, Update, Delete",
    fakeGuesses: [
      "Common Remote User Directory",
      "Centralized Resource Utility Daemon",
      "Core Routine Unified Database",
      "Code Refactor Under Development"
    ]
  },
  {
    acronym: "CORS",
    category: "Tech & Software",
    definition: "Cross-Origin Resource Sharing",
    fakeGuesses: [
      "Central Online Redundancy System",
      "Client Output Routing Service",
      "Continuous Operating Resource Server",
      "Certified Open Relay Socket"
    ]
  },
  {
    acronym: "WYSIWYG",
    category: "Tech & Design",
    definition: "What You See Is What You Get",
    fakeGuesses: [
      "Web Yield System Including Web Yield Graphics",
      "Where Your Source Is Where You Go",
      "Wide Yield Signal Input With Yield Gain",
      "Without You System Is Without Yield Growth"
    ]
  },
  {
    acronym: "DNS",
    category: "Tech & Networking",
    definition: "Domain Name System",
    fakeGuesses: [
      "Dynamic Network Synchronizer",
      "Digital Node Security",
      "Data Network Server",
      "Direct Node Sharing"
    ]
  },
  {
    acronym: "SaaS",
    category: "Tech & Business",
    definition: "Software as a Service",
    fakeGuesses: [
      "Scalable Architecture and Server",
      "System Automation and Security",
      "Structured Application Analytics Software",
      "Synchronized Access and Storage"
    ]
  },
  {
    acronym: "CI/CD",
    category: "Tech & DevOps",
    definition: "Continuous Integration / Continuous Deployment",
    fakeGuesses: [
      "Code Inspection / Code Delivery",
      "Central Interface / Core Daemon",
      "Cloud Infrastructure / Cloud Distribution",
      "Compiled Instance / Cached Data"
    ]
  },
  // Finance & Business
  {
    acronym: "EBITDA",
    category: "Finance & Accounting",
    definition: "Earnings Before Interest, Taxes, Depreciation, and Amortization",
    fakeGuesses: [
      "Equity Balance In Trust Direct Assets",
      "Estimated Budget Including Total Debt Assets",
      "European Bank Investment Tax Dealing Agreement",
      "Enterprise Banking Interest Tax Deductible Accounts"
    ]
  },
  {
    acronym: "ROI",
    category: "Finance & Business",
    definition: "Return on Investment",
    fakeGuesses: [
      "Rate of Inflation",
      "Revenue Output Indicator",
      "Risk Offset Insurance",
      "Realized Operation Income"
    ]
  },
  {
    acronym: "IPO",
    category: "Finance & Investing",
    definition: "Initial Public Offering",
    fakeGuesses: [
      "International Portfolio Option",
      "Internal Profit Optimization",
      "Institutional Price Overhead",
      "Interim Payment Order"
    ]
  },
  {
    acronym: "KPI",
    category: "Business & Management",
    definition: "Key Performance Indicator",
    fakeGuesses: [
      "Knowledge Process Integration",
      "Known Profit Index",
      "Key Production Inventory",
      "Kernel Processing Interface"
    ]
  },
  {
    acronym: "B2B",
    category: "Business & Sales",
    definition: "Business to Business",
    fakeGuesses: [
      "Bridge to Blockchain",
      "Budget to Balance",
      "Back to Base",
      "Branch to Branch"
    ]
  },
  // Medicine & Healthcare
  {
    acronym: "STAT",
    category: "Healthcare & Medicine",
    definition: "Statim (Immediately / At Once)",
    fakeGuesses: [
      "Standard Treatment and Triage",
      "Surgical Team Action Trauma",
      "Stabilize Trauma and Transport",
      "Systemic Toxicity Alert Test"
    ]
  },
  {
    acronym: "HIPAA",
    category: "Healthcare & Law",
    definition: "Health Insurance Portability and Accountability Act",
    fakeGuesses: [
      "Hospital Information Privacy and Authorization Agreement",
      "Healthcare Institution Patient Access Administration",
      "Health Inspection Protection and Audit Authority",
      "Human Immunization Policy and Action Accord"
    ]
  },
  {
    acronym: "ICU",
    category: "Healthcare & Hospital",
    definition: "Intensive Care Unit",
    fakeGuesses: [
      "Internal Clinical Unit",
      "Immediate Cardiac Urgent",
      "Inpatient Consultation Unit",
      "Interventional Care Utility"
    ]
  },
  {
    acronym: "PRN",
    category: "Healthcare & Pharmacy",
    definition: "Pro Re Nata (As Needed / As Circumstances Require)",
    fakeGuesses: [
      "Patient Recovery Notification",
      "Primary Registered Nurse",
      "Post-Recovery Nutrition",
      "Prescription Renewal Notice"
    ]
  },
  {
    acronym: "MRI",
    category: "Healthcare & Radiology",
    definition: "Magnetic Resonance Imaging",
    fakeGuesses: [
      "Medical Radiation Instrument",
      "Molecular Radioisotope Inspection",
      "Mobile Radiology Interface",
      "Mass Resonance Identification"
    ]
  },
  // Marketing & Advertising
  {
    acronym: "CTR",
    category: "Marketing & Ads",
    definition: "Click-Through Rate",
    fakeGuesses: [
      "Customer Target Reach",
      "Conversion Traction Ratio",
      "Campaign Traffic Return",
      "Consumer Trend Rating"
    ]
  },
  {
    acronym: "CAC",
    category: "Marketing & Growth",
    definition: "Customer Acquisition Cost",
    fakeGuesses: [
      "Client Account Conversion",
      "Consumer Affinity Coefficient",
      "Campaign Allocation Cost",
      "Commercial Activity Center"
    ]
  },
  {
    acronym: "SEO",
    category: "Marketing & Web",
    definition: "Search Engine Optimization",
    fakeGuesses: [
      "Site Engagement Operations",
      "Server Execution Order",
      "Social Enterprise Outreach",
      "Search Evaluation Online"
    ]
  },
  // Aviation & Military
  {
    acronym: "ETA",
    category: "Aviation & Logistics",
    definition: "Estimated Time of Arrival",
    fakeGuesses: [
      "Expected Transit Altitude",
      "Electronic Transmission Alert",
      "Engine Thrust Allocation",
      "Emergency Transport Action"
    ]
  },
  {
    acronym: "FOD",
    category: "Aviation & Aerospace",
    definition: "Foreign Object Debris (or Damage)",
    fakeGuesses: [
      "Flight Operation Deck",
      "Fuel Output Differential",
      "Forward Observation Drone",
      "Frequency Oscillating Detector"
    ]
  },
  {
    acronym: "SNAFU",
    category: "Military Slang",
    definition: "Situation Normal: All Fouled Up",
    fakeGuesses: [
      "Standard Navigational Alert For Units",
      "Special Navy Air Fleet Union",
      "Surveillance Network and Flight Unit",
      "System Networked Aircraft Fault Unit"
    ]
  },
  {
    acronym: "AWOL",
    category: "Military & Law",
    definition: "Absent Without Official Leave",
    fakeGuesses: [
      "Armed With Ordered License",
      "Action Warning On Line",
      "Airborne Warfare Officer Lead",
      "Assigned Without Order Level"
    ]
  },
  // Gaming & Esports
  {
    acronym: "DPS",
    category: "Gaming",
    definition: "Damage Per Second",
    fakeGuesses: [
      "Dynamic Player Shield",
      "Dual Pixel Shading",
      "Direct Punch Strike",
      "Defense Penalty System"
    ]
  },
  {
    acronym: "NPC",
    category: "Gaming",
    definition: "Non-Player Character",
    fakeGuesses: [
      "Next Position Checkpoint",
      "Neutral Party Combatant",
      "Network Protocol Controller",
      "Natural Path Calculation"
    ]
  },
  {
    acronym: "RNG",
    category: "Gaming & Math",
    definition: "Random Number Generator",
    fakeGuesses: [
      "Real-time Navigation Grid",
      "Rapid Network Gateway",
      "Rate of Natural Growth",
      "Radial Node Graph"
    ]
  },
  {
    acronym: "AOE",
    category: "Gaming",
    definition: "Area of Effect",
    fakeGuesses: [
      "Attack Over Elevation",
      "Action Order Execution",
      "Armored Objective Entity",
      "Accuracy Optimization Engine"
    ]
  }
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ACRONYM_PRESETS };
}
