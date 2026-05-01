import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Building2,
  Calendar,
  ChevronDown,
  ClipboardCheck,
  Gauge,
  MessageSquare,
  Minus,
  Plus,
  RefreshCw,
  Upload,
  User,
} from "lucide-react";
import { BRAND, ERROR_PURPLE } from "./acStepShared";

const SAMPLE_GREEN = "#7BC9A8";
const SAMPLE_NAVY = "#1E2E47";

export function AcMobileSample() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white font-['Inter']">
      <div className="flex-1 overflow-y-auto pb-6">
        <PinkHero />
        <TitleRow />
        <main className="px-5">
          <StepEyebrow />
          <SystemsCountRow />
          <BrandRow />
          <OwnerToggleRow />
          <EvidenceTilesRow />
          <AvailabilityDateRow />
          <AddAnotherRow />
          <PrimaryCta />
        </main>
      </div>

      {/* SAMPLE-ONLY: dark navy bottom chrome that mirrors the logged-in
          taylr app shell from the reference screenshots. Production
          BookingFlowMobile already removed this bar — keep here so the
          user can judge the full chrome of this scheme. */}
      <SampleNavyChrome />
    </div>
  );
}

/* ─── Hero ───────────────────────────────────────────────────────────────── */

function PinkHero() {
  return (
    <div className="relative pb-10" style={{ backgroundColor: BRAND }}>
      <div className="px-5 pt-5 pb-12">
        <p className="text-white text-[15px] font-semibold">Hi Candice,</p>
      </div>
      {/* overlapping white rounded property card */}
      <div className="absolute left-4 right-4 -bottom-2">
        <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-100 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Building2 className="h-4 w-4 text-slate-500 shrink-0" />
              <p className="text-[14px] font-semibold text-slate-900 truncate">
                1010 / 104 Easty Street
              </p>
            </div>
            <RefreshCw className="h-4 w-4 text-slate-500 shrink-0" />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <ClipboardCheck className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-[12px] text-slate-500">Booking</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TitleRow() {
  return (
    <div className="flex items-start justify-between px-5 pt-8 pb-4">
      <h1 className="text-[22px] font-bold leading-tight text-slate-900">
        Your AC
      </h1>
      <button
        type="button"
        aria-label="Back"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 transition hover:bg-pink-50"
        style={{ borderColor: BRAND, color: BRAND }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ─── Sections ───────────────────────────────────────────────────────────── */

function StepEyebrow() {
  return (
    <p
      className="text-center text-[13px] font-semibold mt-2 mb-4"
      style={{ color: BRAND }}
    >
      Step 2 of 5: Your AC
    </p>
  );
}

function SystemsCountRow() {
  return (
    <section className="mb-5">
      <h3 className="text-[13px] text-slate-700 mb-2">
        2.1. How many AC systems do you have?
      </h3>
      <div className="flex items-center rounded-full border border-slate-200 bg-white pl-5 pr-2 py-2">
        <span className="flex-1 text-[14px] text-slate-900 font-medium">
          2 systems
        </span>
        <button
          type="button"
          aria-label="Decrease"
          className="grid h-8 w-8 place-items-center rounded-full text-white"
          style={{ backgroundColor: BRAND }}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          aria-label="Increase"
          className="ml-1.5 grid h-8 w-8 place-items-center rounded-full text-white"
          style={{ backgroundColor: BRAND }}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}

function BrandRow() {
  return (
    <section className="mb-5">
      <h3 className="text-[13px] text-slate-700 mb-2">
        2.2. AC brand <span className="font-semibold">(as listed on the unit)</span>
      </h3>
      {/* Field with the purple "required" error band — example only */}
      <div
        className="rounded-2xl"
        style={{ backgroundColor: "rgba(151,71,255,0.10)" }}
      >
        <div className="flex items-center rounded-full border border-slate-200 bg-white px-5 py-3">
          <span className="flex-1 text-[14px] text-slate-400">Select brand</span>
          <span
            className="grid h-7 w-7 place-items-center rounded-full text-white"
            style={{ backgroundColor: BRAND }}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
        </div>
        <div
          className="flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium"
          style={{ color: ERROR_PURPLE }}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          <span>This field is required</span>
        </div>
      </div>
    </section>
  );
}

function OwnerToggleRow() {
  return (
    <section className="mb-5">
      <h3 className="text-[13px] text-slate-700 mb-3">
        2.3. Are you the property owner?
      </h3>
      <div className="flex justify-center">
        <YesNoToggle value="no" />
      </div>
    </section>
  );
}

function YesNoToggle({ value }: { value: "yes" | "no" }) {
  const noActive = value === "no";
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-1.5 w-[180px] justify-between">
      <span
        className={`text-[13px] font-semibold ${noActive ? "underline underline-offset-4" : "text-slate-500"}`}
        style={noActive ? { color: BRAND } : undefined}
      >
        No
      </span>
      <span className="relative inline-block w-10 h-5 rounded-full bg-slate-200">
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full transition-all"
          style={{
            backgroundColor: BRAND,
            left: noActive ? "2px" : "calc(100% - 18px)",
          }}
        />
      </span>
      <span
        className={`text-[13px] font-semibold ${!noActive ? "underline underline-offset-4" : "text-slate-500"}`}
        style={!noActive ? { color: BRAND } : undefined}
      >
        Yes
      </span>
    </div>
  );
}

function EvidenceTilesRow() {
  return (
    <section className="mb-5">
      <h3 className="text-[13px] text-slate-700 mb-2">
        2.4. How would you like to provide AC details?
      </h3>
      <div className="grid grid-cols-2 gap-3">
        <SelectableTile
          selected
          icon={<Upload className="h-5 w-5" />}
          label="Upload invoice or receipt"
        />
        <SelectableTile
          icon={<ClipboardCheck className="h-5 w-5" />}
          label="Manually enter details"
        />
      </div>
    </section>
  );
}

function SelectableTile({
  selected = false,
  icon,
  label,
}: {
  selected?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className="flex flex-col items-start gap-2 rounded-xl px-4 py-4 min-h-[110px] text-left transition"
      style={
        selected
          ? { backgroundColor: SAMPLE_GREEN, color: "#ffffff" }
          : { backgroundColor: "#F1F5F9", color: "#0F172A" }
      }
    >
      <span style={selected ? { color: "#ffffff" } : { color: "#0F172A" }}>
        {icon}
      </span>
      <span
        className="text-[13px] font-semibold leading-snug"
        style={selected ? { color: "#ffffff" } : { color: "#0F172A" }}
      >
        {label}
      </span>
    </button>
  );
}

function AvailabilityDateRow() {
  return (
    <section className="mb-5">
      <h3 className="text-[13px] text-slate-700 mb-2">
        2.5. When did you last service your AC?
      </h3>
      <div className="flex items-center rounded-full border border-slate-200 bg-white pl-5 pr-2 py-2">
        <span className="flex-1 text-[14px] text-slate-400">
          <span className="text-slate-700 font-medium">Date:</span> DD / MM / YYYY
        </span>
        <span
          className="grid h-8 w-8 place-items-center rounded-full text-white"
          style={{ backgroundColor: BRAND }}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </span>
        <span
          className="ml-1.5 grid h-8 w-8 place-items-center rounded-full text-white"
          style={{ backgroundColor: BRAND }}
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </span>
      </div>
    </section>
  );
}

function AddAnotherRow() {
  return (
    <button
      type="button"
      className="flex items-center gap-2 mt-2 mb-6"
      style={{ color: BRAND }}
    >
      <span
        className="grid h-6 w-6 place-items-center rounded-full text-white"
        style={{ backgroundColor: BRAND }}
      >
        <Plus className="h-3.5 w-3.5" />
      </span>
      <span className="text-[13px] font-semibold">Add another AC system</span>
    </button>
  );
}

function PrimaryCta() {
  return (
    <div className="flex items-center justify-between mt-6 mb-2">
      <button
        type="button"
        aria-label="Back"
        className="grid h-9 w-9 place-items-center rounded-full text-white"
        style={{ backgroundColor: BRAND }}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        className="flex items-center gap-2 rounded-full px-7 py-3 text-[14px] font-semibold text-white shadow-sm"
        style={{ backgroundColor: BRAND }}
      >
        Continue
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

/* ─── Sample-only bottom chrome ──────────────────────────────────────────── */

function SampleNavyChrome() {
  return (
    <div
      className="shrink-0 px-4 pt-4 pb-3"
      style={{ backgroundColor: SAMPLE_NAVY }}
    >
      <div className="flex items-center justify-between">
        <NavyTab icon={<Gauge className="h-5 w-5" />} />
        <NavyTab icon={<Calendar className="h-5 w-5" />} />
        <div className="text-white text-[22px] font-bold tracking-tight">
          tay<span style={{ color: BRAND }}>l</span>r<span style={{ color: BRAND }}>.</span>
        </div>
        <NavyTab icon={<MessageSquare className="h-5 w-5" />} />
        <NavyTab icon={<User className="h-5 w-5" />} />
      </div>
      <div className="mt-3 flex justify-center">
        <div className="rounded-full border border-white/20 px-5 py-1.5 text-white text-[12px] font-medium">
          taylr.app
        </div>
      </div>
    </div>
  );
}

function NavyTab({ icon }: { icon: React.ReactNode }) {
  return (
    <div className="grid h-9 w-9 place-items-center rounded-full text-white">
      {icon}
    </div>
  );
}
