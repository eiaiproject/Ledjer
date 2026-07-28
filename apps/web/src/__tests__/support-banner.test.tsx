import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SupportBanner, resetSupportBannerDismiss } from "@/components/ui/support-banner";

/* ───── Setup ───── */

beforeEach(() => {
  localStorage.clear();
  resetSupportBannerDismiss();
});

/* ───── SUPPORT_URL is already tested in support-link.test.tsx ───── */

describe("SupportBanner", () => {
  describe("render", () => {
    it("renders the banner with default content", () => {
      render(<SupportBanner />);

      expect(screen.getByText("Ledjer membantu pekerjaan Anda?")).toBeTruthy();
      expect(
        screen.getByText(/Dukungan sukarela melalui Trakteer/),
      ).toBeTruthy();
    });

    it("renders a link to Trakteer with correct attributes", () => {
      render(<SupportBanner />);

      const link = screen.getByRole("link", { name: /Dukung Ledjer/i });
      expect(link).toBeTruthy();
      expect(link).toHaveAttribute("href", "https://trakteer.id/eiaiproject/tip");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });

    it("includes a dismiss button with accessible label", () => {
      render(<SupportBanner />);

      const dismissBtn = screen.getByRole("button", {
        name: /Tutup pemberitahuan dukungan/i,
      });
      expect(dismissBtn).toBeTruthy();
    });
  });

  describe("accessibility", () => {
    it("has role='status' for live region announcements", () => {
      render(<SupportBanner />);

      const banner = screen.getByRole("status");
      expect(banner).toBeTruthy();
    });

    it("has aria-live='polite' to not interrupt", () => {
      render(<SupportBanner />);

      const banner = screen.getByRole("status");
      expect(banner).toHaveAttribute("aria-live", "polite");
    });

    it("dismiss button has aria-label", () => {
      render(<SupportBanner />);

      const dismissBtn = screen.getByRole("button", {
        name: /Tutup pemberitahuan dukungan/i,
      });
      expect(dismissBtn).toBeTruthy();
    });
  });

  describe("dismissal", () => {
    it("hides the banner when dismiss button is clicked", () => {
      render(<SupportBanner />);

      const dismissBtn = screen.getByRole("button", {
        name: /Tutup pemberitahuan dukungan/i,
      });
      fireEvent.click(dismissBtn);

      expect(screen.queryByRole("status")).toBeNull();
    });

    it("calls onDismiss callback when dismissed", () => {
      const onDismiss = vi.fn();
      render(<SupportBanner onDismiss={onDismiss} />);

      const dismissBtn = screen.getByRole("button", {
        name: /Tutup pemberitahuan dukungan/i,
      });
      fireEvent.click(dismissBtn);

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it("persists dismissal to localStorage", () => {
      render(<SupportBanner />);

      const dismissBtn = screen.getByRole("button", {
        name: /Tutup pemberitahuan dukungan/i,
      });
      fireEvent.click(dismissBtn);

      const stored = localStorage.getItem("ledjer:support_banner_dismissed_at");
      expect(stored).toBeTruthy();
      expect(Number(stored)).toBeGreaterThan(0);
    });

    it("does not show again after dismissal within cooldown period", () => {
      // First render — dismiss
      const { unmount } = render(<SupportBanner />);
      const dismissBtn = screen.getByRole("button", {
        name: /Tutup pemberitahuan dukungan/i,
      });
      fireEvent.click(dismissBtn);
      unmount();

      // Second render — should be hidden (within 7-day cooldown)
      render(<SupportBanner />);
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("forceShow", () => {
    it("shows banner even when previously dismissed", () => {
      // First — dismiss
      const { unmount } = render(<SupportBanner />);
      const dismissBtn = screen.getByRole("button", {
        name: /Tutup pemberitahuan dukungan/i,
      });
      fireEvent.click(dismissBtn);
      unmount();

      // Second — force show overrides dismissal
      render(<SupportBanner forceShow />);
      expect(screen.getByRole("status")).toBeTruthy();
    });
  });

  describe("localStorage errors", () => {
    it("handles localStorage.setItem throwing gracefully", () => {
      const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("Storage full");
      });

      render(<SupportBanner />);
      const dismissBtn = screen.getByRole("button", {
        name: /Tutup pemberitahuan dukungan/i,
      });
      // Should not throw
      expect(() => fireEvent.click(dismissBtn)).not.toThrow();

      setItem.mockRestore();
    });

    it("handles localStorage.getItem throwing gracefully", () => {
      const getItem = vi
        .spyOn(Storage.prototype, "getItem")
        .mockImplementation(() => {
          throw new Error("Storage unavailable");
        });

      // Should render without throwing
      expect(() => render(<SupportBanner />)).not.toThrow();

      getItem.mockRestore();
    });

    it("handles localStorage.removeItem throwing gracefully", () => {
      const removeItem = vi
        .spyOn(Storage.prototype, "removeItem")
        .mockImplementation(() => {
          throw new Error("Storage unavailable");
        });

      // resetSupportBannerDismiss should not throw
      expect(() => resetSupportBannerDismiss()).not.toThrow();

      removeItem.mockRestore();
    });
  });

  describe("custom className", () => {
    it("merges custom className with existing classes", () => {
      render(<SupportBanner className="my-custom-class" />);

      const banner = screen.getByRole("status");
      expect(banner.className).toContain("my-custom-class");
      expect(banner.className).toContain("rounded-xl");
    });
  });

  describe("calls support click handler", () => {
    it("calls onSupportClick when support link is clicked", () => {
      const onSupportClick = vi.fn();
      render(<SupportBanner onSupportClick={onSupportClick} />);

      const link = screen.getByRole("link", { name: /Dukung Ledjer/i });
      fireEvent.click(link);

      expect(onSupportClick).toHaveBeenCalledTimes(1);
    });
  });
});
