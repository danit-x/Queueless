import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../layouts/AppLayout";
import {
  deleteProfilePhoto,
  getProfilePhotoUrl,
  updateProfile,
  uploadProfilePhoto,
} from "../services/authService";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";

// Must match the backend: express.raw limit and the signature check in putProfilePhoto.
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phoneNumber: user?.phoneNumber ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef(null);

  // Keep the object URL in a ref too, so the unmount cleanup always revokes the latest one.
  const photoUrlRef = useRef(null);
  function replacePhotoUrl(nextUrl) {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = nextUrl;
    setPhotoUrl(nextUrl);
  }

  const hasProfilePhoto = Boolean(user?.hasProfilePhoto);

  useEffect(() => {
    let cancelled = false;

    if (!hasProfilePhoto) {
      replacePhotoUrl(null);
      return undefined;
    }

    getProfilePhotoUrl()
      .then((url) => {
        if (cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        replacePhotoUrl(url);
      })
      .catch(() => {
        if (!cancelled) replacePhotoUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [hasProfilePhoto]);

  useEffect(() => () => replacePhotoUrl(null), []);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    try {
      const { user: updated } = await updateProfile({
        name: form.name.trim(),
        email: form.email.trim(),
        phoneNumber: form.phoneNumber.trim(),
      });
      updateUser(updated);
      setMessage("Profile saved.");
    } catch (saveError) {
      setError(saveError.message || "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setMessage("");
    setError("");

    if (!PHOTO_TYPES.includes(file.type)) {
      setError("Profile photo must be a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Profile photo must be 2 MB or smaller.");
      return;
    }

    setPhotoBusy(true);
    try {
      const { user: updated } = await uploadProfilePhoto(file);
      // Show the new image straight away instead of waiting for a re-fetch.
      replacePhotoUrl(URL.createObjectURL(file));
      updateUser(updated);
      setMessage("Profile photo updated.");
    } catch (uploadError) {
      setError(uploadError.message || "Unable to upload the photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function handleRemovePhoto() {
    setMessage("");
    setError("");
    setPhotoBusy(true);
    try {
      const { user: updated } = await deleteProfilePhoto();
      replacePhotoUrl(null);
      updateUser(updated);
      setMessage("Profile photo removed.");
    } catch (removeError) {
      setError(removeError.message || "Unable to remove the photo.");
    } finally {
      setPhotoBusy(false);
    }
  }

  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <AppLayout>
      <Link to="/dashboard" className="text-sm font-medium text-brand-700 hover:underline">
        ← Back to dashboard
      </Link>

      <section className="mx-auto mt-4 max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-950">Your profile</h1>
        <p className="mt-1 text-sm text-slate-600">
          Account type: <span className="font-medium capitalize text-slate-900">{user?.role}</span>
        </p>

        {message && (
          <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center gap-4">
          {photoUrl ? (
            <img src={photoUrl} alt="Your profile" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <span
              className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-50 text-2xl font-semibold text-brand-700"
              aria-hidden="true"
            >
              {initial}
            </span>
          )}

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInput}
              type="file"
              accept={PHOTO_TYPES.join(",")}
              className="hidden"
              onChange={handlePhotoSelected}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={photoBusy}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {photoBusy ? "Working..." : hasProfilePhoto ? "Change photo" : "Upload photo"}
            </button>
            {hasProfilePhoto && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                disabled={photoBusy}
                className="rounded-md px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit} noValidate>
          <label className="block text-sm font-medium text-slate-700">
            Name
            <input className={inputClass} name="name" value={form.name} onChange={handleChange} maxLength={120} />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Email
            <input className={inputClass} name="email" type="email" value={form.email} onChange={handleChange} />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Phone number <span className="font-normal text-slate-500">(optional)</span>
            <input
              className={inputClass}
              name="phoneNumber"
              type="tel"
              value={form.phoneNumber}
              onChange={handleChange}
              maxLength={30}
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-md bg-brand-600 px-4 py-3 font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? "Saving..." : "Save profile"}
          </button>
        </form>
      </section>
    </AppLayout>
  );
}
