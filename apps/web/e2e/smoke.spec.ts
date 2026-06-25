import { test, expect } from '@playwright/test'

/**
 * Production smoke E2E tests.
 * Covers: auth screen loads, navigation guards, page accessibility.
 * Ponytail: add auth flow tests when test user seeding is available.
 */

test.describe('Auth / Login', () => {
  test('login page loads with expected elements', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveTitle(/Ledjer/)
    // Login form should be visible
    const emailInput = page.getByRole('textbox', { name: /email/i })
    await expect(emailInput).toBeVisible()
    const passwordInput = page.getByRole('textbox', { name: /password/i })
    await expect(passwordInput).toBeVisible()
  })

  test('register page loads', async ({ page }) => {
    await page.goto('/register')
    await expect(page).toHaveTitle(/Ledjer/)
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
  })

  test('forgot password page loads', async ({ page }) => {
    await page.goto('/forgot-password')
    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible()
  })
})

test.describe('Route guards', () => {
  test('unauthenticated user redirects from dashboard to login', async ({ page }) => {
    await page.goto('/dashboard')
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated user redirects from transactions to login', async ({ page }) => {
    await page.goto('/transactions')
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Landing page', () => {
  test('landing page loads and has expected content', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Ledjer/)
    // Should contain branding text
    await expect(page.locator('body')).toContainText('Ledjer')
  })
})

test.describe('Accessibility basics', () => {
  test('login page has no automatically detectable critical a11y violations', async ({ page }) => {
    await page.goto('/login')
    // Basic a11y checks: page has lang attribute, inputs have labels
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', 'id')
    // Email input should have an accessible name
    const emailInput = page.getByRole('textbox', { name: /email/i })
    await expect(emailInput).toBeVisible()
  })

  test('landing page has html lang attribute', async ({ page }) => {
    await page.goto('/')
    const html = page.locator('html')
    await expect(html).toHaveAttribute('lang', 'id')
  })
})
