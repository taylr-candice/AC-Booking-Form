import React from "react";
import { ArrowRight, CheckCircle2, User, Briefcase } from "lucide-react";
import { bookingActions, useBookingSelector } from "../../../state/bookingSession";

const BRAND = "#ED017F";
const SELECTED_GREEN = "#1F7A57";

export function RoleDesktop() {
  const role = useBookingSelector((s) => s.role);

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-['Inter'] flex justify-center overflow-y-auto">
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-8 md:p-10 flex flex-col">
          
          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Step 2 of 7</div>
            <h1 className="text-2xl font-semibold text-slate-900">What's your relationship to the property?</h1>
          </div>

          <div className="flex-1">
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => bookingActions.setRole("owner")}
                data-testid="card-role-owner"
                className={`relative flex flex-col items-center text-center rounded-2xl border p-8 transition-all ${
                  role === "owner"
                    ? "shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                style={
                  role === "owner"
                    ? {
                        borderColor: "#1F7A57",
                        backgroundColor: "#1F7A57",
                      }
                    : {}
                }
              >
                <div
                  className={`mb-4 grid h-16 w-16 place-items-center rounded-2xl ${role === "owner" ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  <User className="h-8 w-8" />
                </div>
                <h3 className={`text-lg font-bold mb-2 ${role === "owner" ? "text-white" : "text-slate-900"}`}>Owner</h3>
                <p className={`text-sm ${role === "owner" ? "text-white/85" : "text-slate-500"}`}>
                  I own this apartment, whether I live in it or lease it out.
                </p>
                {role === "owner" && (
                  <div className="absolute top-4 right-4">
                    <CheckCircle2 className="h-6 w-6 text-white" />
                  </div>
                )}
              </button>

              <button
                type="button"
                onClick={() => bookingActions.setRole("agent")}
                data-testid="card-role-agent"
                className={`relative flex flex-col items-center text-center rounded-2xl border p-8 transition-all ${
                  role === "agent"
                    ? "shadow-sm"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                style={
                  role === "agent"
                    ? {
                        borderColor: "#1F7A57",
                        backgroundColor: "#1F7A57",
                      }
                    : {}
                }
              >
                <div
                  className={`mb-4 grid h-16 w-16 place-items-center rounded-2xl ${role === "agent" ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}
                >
                  <Briefcase className="h-8 w-8" />
                </div>
                <h3 className={`text-lg font-bold mb-2 ${role === "agent" ? "text-white" : "text-slate-900"}`}>Agent · Property Manager</h3>
                <p className={`text-sm ${role === "agent" ? "text-white/85" : "text-slate-500"}`}>
                  I manage this apartment on behalf of the owner.
                </p>
                {role === "agent" && (
                  <div className="absolute top-4 right-4">
                    <CheckCircle2 className="h-6 w-6 text-white" />
                  </div>
                )}
              </button>
            </div>
          </div>

          <div className="mt-12 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
              data-testid="button-back-desktop"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!role}
              data-testid="button-continue"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition disabled:opacity-50 hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
