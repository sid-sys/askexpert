"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { doc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS, SocialLink } from "@/lib/types";
import Swal from "sweetalert2";
import { reportBug } from "@/lib/report-bug";

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$", gbp: "£", eur: "€", inr: "₹", cad: "CA$", aud: "AU$", sgd: "S$",
};

export function useProfileSettings() {
  const { user, userProfile, refreshProfile } = useAuth();
  // Hydration model:
  //   • The populate effect runs on every userProfile change, re-syncing
  //     state to whatever Firestore most recently returned — but ONLY for
  //     fields the user hasn't manually edited yet. This handles the
  //     "cached snapshot first, network snapshot later" race where a fresh
  //     reload sometimes sees a stale doc (missing newly-saved bankDetails)
  //     and the network update arrives a beat later. The once-only guard
  //     we used before skipped that second update and left the form empty.
  //   • `userTouched` tracks which fields the user has typed into during
  //     this session, so a late-arriving snapshot can never clobber a
  //     pending edit.
  //   • `isReady` flips true on the first populate and gates the Save
  //     button so an empty default can't be written before hydration.
  const userTouched = useRef<Set<string>>(new Set());
  const [isReady, setIsReady] = useState(false);

  // Marks a field as user-edited the moment its setter is called from the
  // UI. Setters wired through the returned `setX` helpers below call this
  // automatically; internal `setX(...)` calls inside the populate effect
  // bypass it (because they don't reach the wrapper).
  const markTouched = (field: string) => { userTouched.current.add(field); };
  const isTouched   = (field: string) => userTouched.current.has(field);

  // Profile fields
  const [displayName,     setDisplayName]     = useState("");
  const [tagline,         setTagline]         = useState("");
  const [bio,             setBio]             = useState("");
  const [newUsername,     setNewUsername]     = useState("");
  const [usernameStatus,  setUsernameStatus]  = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [responseFormats, setResponseFormats] = useState<string[]>(["text"]);
  const [categories,      setCategories]      = useState<string[]>([]);
  const [socialLinks,     setSocialLinks]     = useState<SocialLink[]>([]);
  const [perQ,      setPerQ]      = useState(500);
  const [monthly,   setMonthly]   = useState(1000);
  const [currency,  setCurrency]  = useState("usd");
  const [responseTimeHours, setResponseTimeHours] = useState(72);
  const [subscriberPerks,   setSubscriberPerks]   = useState<string[]>([]);
  // The UI lets the creator pick any of these manual sub-methods (each has
  // its own input panel). Old typing said `stripe_connect | manual_bank`
  // only — that compiled at runtime via `as any` casts but obscured the real
  // set of values the save path has to handle.
  const [payoutMethod, setPayoutMethod] = useState<
    "stripe_connect" | "manual_bank" | "local_bank" | "international_bank" | "paypal" | "wise"
  >("manual_bank");
  const [vacationMode,  setVacationMode]  = useState(false);
  const [vacationUntil, setVacationUntil] = useState<Date | null>(null);
  const [vacationMessage, setVacationMessage] = useState("");

  // Bank Details
  const [bankName,      setBankName]      = useState("");
  const [accountHolder, setAccountHolder] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankCountry,   setBankCountry]   = useState("");
  const [ifscCode,      setIfscCode]      = useState("");
  const [swiftCode,     setSwiftCode]     = useState("");
  const [paypalEmail,   setPaypalEmail]   = useState("");
  const [wiseEmail,     setWiseEmail]     = useState("");

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [lastSavedData, setLastSavedData] = useState<string>("");

  // ── Populate form from profile ────────────────────────────────────────────
  // Re-runs whenever userProfile changes. Updates ONLY untouched fields so
  // a late-arriving Firestore snapshot can backfill data (e.g. bankDetails
  // that wasn't in the cached snapshot) without clobbering a user's pending
  // edit elsewhere on the page.
  useEffect(() => {
    if (!userProfile) return;
    const u: any = userProfile;

    if (!isTouched("perQ"))               setPerQ(u.perQuestionPrice ?? 500);
    if (!isTouched("monthly"))            setMonthly(u.monthlyPrice ?? 1000);
    if (!isTouched("currency"))           setCurrency(u.currency || "usd");
    if (!isTouched("displayName"))        setDisplayName(u.displayName || "");
    if (!isTouched("tagline"))            setTagline(u.tagline || "");
    if (!isTouched("bio"))                setBio(u.bio || "");
    if (!isTouched("newUsername"))        setNewUsername(u.username || "");
    if (!isTouched("responseFormats"))    setResponseFormats(u.responseFormats || ["text"]);
    if (!isTouched("categories"))         setCategories(u.categories || []);
    if (!isTouched("responseTimeHours"))  setResponseTimeHours(u.responseTimeHours ?? 72);
    if (!isTouched("payoutMethod"))       setPayoutMethod(u.payoutMethod ?? "manual_bank");
    if (!isTouched("vacationMode"))       setVacationMode(u.vacationMode ?? false);
    if (!isTouched("vacationUntil"))      setVacationUntil(u.vacationUntil?.toDate?.() || null);
    if (!isTouched("vacationMessage"))    setVacationMessage(u.vacationMessage || "");

    const bd = u.bankDetails;
    if (bd) {
      if (!isTouched("bankName"))      setBankName(bd.bankName ?? "");
      if (!isTouched("accountHolder")) setAccountHolder(bd.accountHolderName ?? "");
      if (!isTouched("accountNumber")) setAccountNumber(bd.accountNumber ?? "");
      if (!isTouched("bankCountry"))   setBankCountry(bd.country ?? "");
      if (!isTouched("ifscCode"))      setIfscCode(bd.ifscCode ?? "");
      if (!isTouched("swiftCode"))     setSwiftCode(bd.swiftCode ?? "");
      if (!isTouched("paypalEmail"))   setPaypalEmail(bd.paypalEmail ?? "");
      if (!isTouched("wiseEmail"))     setWiseEmail(bd.wiseEmail ?? "");
    }

    if (!isTouched("socialLinks"))    setSocialLinks(Array.isArray(u.socialLinks) ? u.socialLinks : []);
    if (!isTouched("subscriberPerks")) setSubscriberPerks(u.subscriberPerks || []);

    setLastSavedData(JSON.stringify({ vacationMode: u.vacationMode ?? false }));
    setIsReady(true);
  }, [userProfile]);

  // ── Core save function ────────────────────────────────────────────────────
  const saveNow = useCallback(async () => {
    if (!user) return;
    // Refuse to save before the form has been hydrated from Firestore. The
    // SaveButton is already disabled when !isReady, but this is a belt-and-
    // braces guard so a stale closure / programmatic call can never wipe
    // the user's previously-saved data with useState defaults.
    if (!isReady) return;
    setSaving(true);
    try {
      const updateData: any = {
        perQuestionPrice: perQ,
        monthlyPrice:     monthly,
        currency, bio, tagline, displayName, isCreator: true,
        categories, responseTimeHours, subscriberPerks, socialLinks,
        payoutMethod, vacationMode, vacationUntil, vacationMessage,
        updatedAt: serverTimestamp(),
      };
      // Persist payout details for every non-Stripe-Connect method. The UI
      // sets payoutMethod to one of `paypal | wise | local_bank |
      // international_bank | manual_bank` once the creator picks a manual
      // option, and each of those modes has its own input fields. The old
      // condition only matched `"manual_bank"`, which meant data typed in
      // any other mode was silently dropped on save. We now write the full
      // bankDetails object regardless — only Stripe Connect (which manages
      // payout info on Stripe's side) is exempt.
      //
      // Firestore rejects `undefined`; coerce every field to a string so a
      // momentary undefined doesn't blow up the entire write.
      if (payoutMethod !== "stripe_connect") {
        updateData.bankDetails = {
          accountHolderName: accountHolder ?? "",
          accountNumber:     accountNumber ?? "",
          bankName:          bankName      ?? "",
          country:           bankCountry   ?? "",
          ifscCode:          ifscCode      ?? "",
          swiftCode:         swiftCode     ?? "",
          paypalEmail:       paypalEmail   ?? "",
          wiseEmail:         wiseEmail     ?? "",
        };
      }
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), updateData);

      if (lastSavedData) {
        const prev = JSON.parse(lastSavedData);
        if (prev.vacationMode === true && vacationMode === false) {
          fetch("/api/vacation/notify-return", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creatorId: user.uid }),
          }).catch(err => console.error("Notify return error:", err));
        }
      }
      setLastSavedData(JSON.stringify({ vacationMode }));
      setSaved(true);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(15);
      setTimeout(() => setSaved(false), 3000);
      // Refresh the cached profile so the public /[username] page and the
      // payout/pricing/edit-profile tabs reflect what we just wrote without a
      // page reload. (AuthContext also has an onSnapshot listener that picks
      // this up, but the explicit refresh removes any timing dependency.)
      try { await refreshProfile(); } catch { /* non-fatal */ }
    } catch (e: any) {
      console.error("Save error:", e);
      // Single unified error UX: friendly "Something went wrong" modal with
      // a one-tap bug report. Replaces the raw error / silent-failure path
      // so the user never sees a stack trace and our team gets context.
      reportBug({ error: e, context: "profile-save" });
    } finally {
      setSaving(false);
    }
  }, [
    user, perQ, monthly, currency, bio, tagline, displayName, categories,
    responseTimeHours, subscriberPerks, socialLinks, payoutMethod,
    vacationMode, vacationUntil, vacationMessage, bankName, accountHolder,
    accountNumber, bankCountry, ifscCode, swiftCode, paypalEmail, wiseEmail,
    lastSavedData, refreshProfile, isReady,
  ]);

  // ── Username check ────────────────────────────────────────────────────────
  useEffect(() => {
    const current = userProfile?.username || "";
    if (newUsername === current || newUsername === "") { setUsernameStatus("idle"); return; }
    const isValid = /^[a-z0-9_]{3,20}$/.test(newUsername);
    if (!isValid) { setUsernameStatus("invalid"); return; }
    
    setUsernameStatus("checking");
    const t = setTimeout(async () => {
      const q = query(collection(db, COLLECTIONS.USERS), where("username", "==", newUsername));
      const snap = await getDocs(q);
      setUsernameStatus(snap.empty ? "available" : "taken");
    }, 600);
    return () => clearTimeout(t);
  }, [newUsername, userProfile?.username]);

  const confirmUsername = async () => {
    if (!user || usernameStatus !== "available") return;
    
    const result = await Swal.fire({
      title: "Change Username?",
      text: `Your profile URL will change to askexpert.live/${newUsername}. Old links will break!`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#7c3aed",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Yes, change it!",
      background: "#fff",
      color: "#1f2937"
    });

    if (!result.isConfirmed) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, COLLECTIONS.USERS, user.uid), { username: newUsername });
      setSaved(true);
      Swal.fire({
        title: "Success!",
        text: "Username updated successfully.",
        icon: "success",
        timer: 2000,
        showConfirmButton: false,
      });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
      reportBug({ error: e, context: "username-update" });
    } finally {
      setSaving(false);
    }
  };

  // ── Touch-tracking setters ────────────────────────────────────────────────
  // Each public setter below marks its field as user-edited before delegating
  // to the underlying React setter. Once a field is touched, the populate
  // effect will leave it alone — protecting user-typed values from being
  // overwritten by a late Firestore snapshot. Internal calls inside the
  // populate effect use the raw setters (above) so they DON'T mark touched.
  const tSet = <T,>(field: string, raw: (v: T) => void) =>
    (v: T) => { markTouched(field); raw(v); };
  // Wrappers for React.Dispatch<SetStateAction<...>> setters (accept value
  // OR updater function). React's signature accepts either, so we just
  // forward.
  const tSetDispatch = <T,>(field: string, raw: React.Dispatch<React.SetStateAction<T>>) =>
    (v: React.SetStateAction<T>) => { markTouched(field); raw(v); };

  return {
    displayName,        setDisplayName:       tSet("displayName",       setDisplayName),
    tagline,            setTagline:           tSet("tagline",           setTagline),
    bio,                setBio:               tSet("bio",               setBio),
    newUsername,        setNewUsername:       tSet("newUsername",       setNewUsername),
    usernameStatus,     confirmUsername,
    responseFormats,    setResponseFormats:   tSetDispatch("responseFormats", setResponseFormats),
    categories,         setCategories:        tSetDispatch("categories",      setCategories),
    socialLinks,        setSocialLinks:       tSetDispatch("socialLinks",     setSocialLinks),
    perQ,               setPerQ:              tSet("perQ",              setPerQ),
    monthly,            setMonthly:           tSet("monthly",           setMonthly),
    currency,           setCurrency:          tSet("currency",          setCurrency),
    responseTimeHours,  setResponseTimeHours: tSet("responseTimeHours", setResponseTimeHours),
    subscriberPerks,    setSubscriberPerks:   tSetDispatch("subscriberPerks", setSubscriberPerks),
    payoutMethod,       setPayoutMethod:      tSet("payoutMethod",      setPayoutMethod),
    bankName,           setBankName:          tSet("bankName",          setBankName),
    accountHolder,      setAccountHolder:     tSet("accountHolder",     setAccountHolder),
    accountNumber,      setAccountNumber:     tSet("accountNumber",     setAccountNumber),
    bankCountry,        setBankCountry:       tSet("bankCountry",       setBankCountry),
    ifscCode,           setIfscCode:          tSet("ifscCode",          setIfscCode),
    swiftCode,          setSwiftCode:         tSet("swiftCode",         setSwiftCode),
    paypalEmail,        setPaypalEmail:       tSet("paypalEmail",       setPaypalEmail),
    wiseEmail,          setWiseEmail:         tSet("wiseEmail",         setWiseEmail),
    vacationMode,       setVacationMode:      tSet("vacationMode",      setVacationMode),
    vacationUntil,      setVacationUntil:     tSet("vacationUntil",     setVacationUntil),
    vacationMessage,    setVacationMessage:   tSet("vacationMessage",   setVacationMessage),
    saving, saved, saveNow,
    isReady,
  };
}
