"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { doc, updateDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS, SocialLink } from "@/lib/types";
import Swal from "sweetalert2";

const CURRENCY_SYMBOLS: Record<string, string> = {
  usd: "$", gbp: "£", eur: "€", inr: "₹", cad: "CA$", aud: "AU$", sgd: "S$",
};

export function useProfileSettings() {
  const { user, userProfile, refreshProfile } = useAuth();
  const isInitialized = useRef(false);

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
  const [payoutMethod,  setPayoutMethod]  = useState<"stripe_connect" | "manual_bank">("manual_bank");
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
  useEffect(() => {
    if (!userProfile || isInitialized.current) return;
    
    isInitialized.current = true;
    setPerQ(userProfile.perQuestionPrice ?? 500);
    setMonthly(userProfile.monthlyPrice ?? 1000);
    
    let initialCurrency = (userProfile as any).currency || "usd";
    setCurrency(initialCurrency);
    setDisplayName(userProfile.displayName || "");
    setTagline((userProfile as any).tagline || "");
    setBio(userProfile.bio || "");
    setNewUsername(userProfile.username || "");
    setResponseFormats((userProfile as any).responseFormats || ["text"]);
    setCategories((userProfile as any).categories || []);
    setResponseTimeHours((userProfile as any).responseTimeHours ?? 72);
    setPayoutMethod((userProfile as any).payoutMethod ?? "manual_bank");
    setVacationMode((userProfile as any).vacationMode ?? false);
    setVacationUntil((userProfile as any).vacationUntil?.toDate?.() || null);
    setVacationMessage((userProfile as any).vacationMessage || "");
    
    const bd = (userProfile as any).bankDetails;
    if (bd) {
      setBankName(bd.bankName ?? "");
      setAccountHolder(bd.accountHolderName ?? "");
      setAccountNumber(bd.accountNumber ?? "");
      setBankCountry(bd.country ?? "");
      setIfscCode(bd.ifscCode ?? "");
      setSwiftCode(bd.swiftCode ?? "");
      setPaypalEmail(bd.paypalEmail ?? "");
      setWiseEmail(bd.wiseEmail ?? "");
    }
    
    const rawSl = (userProfile as any).socialLinks;
    setSocialLinks(Array.isArray(rawSl) ? rawSl : []);
    setSubscriberPerks((userProfile as any).subscriberPerks || []);
    setLastSavedData(JSON.stringify({ vacationMode: (userProfile as any).vacationMode ?? false }));
  }, [userProfile]);

  // ── Core save function ────────────────────────────────────────────────────
  const saveNow = useCallback(async () => {
    if (!user) return;
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
      if (payoutMethod !== "stripe_connect") {
        updateData.bankDetails = {
          accountHolderName: accountHolder,
          accountNumber,
          bankName,
          country:    bankCountry,
          ifscCode,
          swiftCode,
          paypalEmail,
          wiseEmail,
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
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setSaving(false);
    }
  }, [
    user, perQ, monthly, currency, bio, tagline, displayName, categories,
    responseTimeHours, subscriberPerks, socialLinks, payoutMethod,
    vacationMode, vacationUntil, vacationMessage, bankName, accountHolder,
    accountNumber, bankCountry, ifscCode, swiftCode, paypalEmail, wiseEmail, lastSavedData,
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
      Swal.fire("Error", "Failed to update username. Try again.", "error");
    } finally {
      setSaving(false);
    }
  };

  return {
    displayName, setDisplayName,
    tagline, setTagline,
    bio, setBio,
    newUsername, setNewUsername,
    usernameStatus, confirmUsername,
    responseFormats, setResponseFormats,
    categories, setCategories,
    socialLinks, setSocialLinks,
    perQ, setPerQ,
    monthly, setMonthly,
    currency, setCurrency,
    responseTimeHours, setResponseTimeHours,
    subscriberPerks, setSubscriberPerks,
    payoutMethod, setPayoutMethod,
    bankName, setBankName,
    accountHolder, setAccountHolder,
    accountNumber, setAccountNumber,
    bankCountry, setBankCountry,
    ifscCode, setIfscCode,
    swiftCode, setSwiftCode,
    paypalEmail, setPaypalEmail,
    wiseEmail, setWiseEmail,
    vacationMode, setVacationMode,
    vacationUntil, setVacationUntil,
    vacationMessage, setVacationMessage,
    saving, saved, saveNow
  };
}
