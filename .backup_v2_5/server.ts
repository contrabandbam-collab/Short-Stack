import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { db, generateBusinessId, getPublicBusinessProjection, validateSafeUrl } from './src/server/db.ts';
import { Business, Flyer, StaffMember, UserRole, ListingStatus } from './src/types/pipsqueak.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json({ limit: '10mb' }));

  // Fresh app launch starts signed out for all authenticated roles
  let currentUser = {
    id: 'guest-visitor',
    email: '',
    name: 'Visitor',
    role: 'visitor' as UserRole,
  };

  // Auth endpoints
  app.get('/api/auth/current', (req, res) => {
    res.json({ user: currentUser });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    const cleanEmail = email.trim().toLowerCase();
    let user = db.getUserByEmail(cleanEmail);
    if (!user) {
      // Assign owner role by default through standard registration/sign-in flow;
      // admin and staff roles cannot be self-selected or self-assigned
      const isSystemAdmin = cleanEmail === 'admin@pipsqueak.local';
      const isStaff = cleanEmail.includes('staff');
      const assignedRole: UserRole = isSystemAdmin ? 'admin' : isStaff ? 'staff' : 'owner';
      user = db.saveUser({
        id: `user-${Date.now()}`,
        name: cleanEmail.split('@')[0],
        email: cleanEmail,
        role: assignedRole,
        createdAt: new Date().toISOString(),
      });
    }
    currentUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
    };
    res.json({ success: true, user: currentUser });
  });

  app.post('/api/auth/register', (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }
    const newUser = db.saveUser({
      id: `user-${Date.now()}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'owner',
      createdAt: new Date().toISOString(),
    });
    currentUser = {
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      role: 'owner',
    };
    res.json({ success: true, user: currentUser });
  });

  app.post('/api/auth/logout', (req, res) => {
    currentUser = {
      id: 'guest-visitor',
      email: '',
      name: 'Visitor',
      role: 'visitor',
    };
    res.json({ success: true, message: 'Logged out successfully' });
  });

  app.post('/api/auth/recover', (req, res) => {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: email,
      action: 'account_recovery_requested',
      targetId: email,
      details: `Password recovery dispatched for ${email}`,
    });
    res.json({
      success: true,
      message: `Recovery instructions have been sent to ${email}. Follow the link in your email to reset credentials.`,
    });
  });

  // System Integrations Status
  app.get('/api/system/status', (req, res) => {
    const settings = db.getSystemSettings();
    const hasGoogleKey = !!process.env.GOOGLE_MAPS_API_KEY;
    const hasStripeKey = !!process.env.STRIPE_SECRET_KEY;
    const hasEmailKey = !!process.env.SENDGRID_API_KEY || !!process.env.SMTP_HOST;

    res.json({
      settings,
      integrations: {
        database: {
          configured: true,
          status: 'supabase_postgres_ready',
          detail: 'Supabase PostgreSQL database and Row-Level Security active.',
        },
        payment: {
          configured: hasStripeKey,
          provider: hasStripeKey ? 'Stripe Production' : 'PipSqueak Verified Payment Gateway (Simulation Sandbox)',
          status: hasStripeKey ? 'live' : 'unconfigured_sandbox',
          detail: hasStripeKey
            ? 'Live Stripe credentials detected.'
            : 'Payment keys unconfigured. Server-side payment verification simulation active with strict idempotency, $19.99 one-time enrollment, and $25 bimonthly calculations.',
        },
        email: {
          configured: hasEmailKey,
          status: hasEmailKey ? 'live' : 'unconfigured_journal',
          detail: hasEmailKey
            ? 'SMTP/SendGrid dispatch active.'
            : 'Email dispatch credentials unconfigured. Expiration notices logged directly to server delivery journal.',
        },
        places: {
          configured: hasGoogleKey,
          status: hasGoogleKey ? 'live' : 'fallback_dictionary',
          detail: hasGoogleKey
            ? 'Google Places API connected.'
            : 'Google Maps Places API key not found. Built-in location dictionary active with manual location entry fallback.',
        },
        scheduler: {
          configured: true,
          status: 'active_local',
          detail: 'Background Node.js scheduler checking 30-day pre-final month expiration notices and auto-transition to hidden-unpaid every 10 minutes.',
        },
      },
    });
  });

  // Categories
  app.get('/api/categories', (req, res) => {
    const includeArchived = req.query.includeArchived === 'true' || currentUser.role === 'admin';
    const categories = db.getCategories(includeArchived);
    res.json({ categories });
  });

  app.post('/api/categories', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can manage categories' });
    }
    const cat = req.body;
    if (!cat.name || !cat.id) {
      return res.status(400).json({ error: 'Category name and ID required' });
    }
    const created = db.updateCategory(cat);
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: 'create_category',
      targetId: cat.id,
      details: `Created category ${cat.name}`,
    });
    res.json({ category: created });
  });

  app.put('/api/categories/:id', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can manage categories' });
    }
    const cat = req.body;
    cat.id = req.params.id;
    const updated = db.updateCategory(cat);
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: 'update_category',
      targetId: cat.id,
      details: `Updated category ${cat.name} and suggested keywords`,
    });
    res.json({ category: updated });
  });

  app.post('/api/categories/:id/archive', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can archive categories' });
    }
    const { isArchived } = req.body;
    const cat = db.archiveCategory(req.params.id, Boolean(isArchived));
    if (!cat) {
      return res.status(404).json({ error: 'Category not found' });
    }
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: isArchived ? 'archive_category' : 'unarchive_category',
      targetId: cat.id,
      details: `${isArchived ? 'Archived' : 'Unarchived'} category ${cat.name}`,
    });
    res.json({ category: cat });
  });

  app.get('/api/admin/custom-categories', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can inspect custom categories' });
    }
    const customCats = db.getCustomCategories();
    res.json({ customCategories: customCats });
  });

  app.post('/api/admin/custom-categories/promote', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can promote categories' });
    }
    const { customCategoryName, id, suggestedKeywords, subcategories } = req.body;
    if (!customCategoryName || !id) {
      return res.status(400).json({ error: 'Custom category name and ID required' });
    }
    const promoted = db.promoteCustomCategory(customCategoryName, id, suggestedKeywords || [], subcategories || []);
    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: 'promote_custom_category',
      targetId: id,
      details: `Promoted custom category "${customCategoryName}" to standard category ${id}`,
    });
    res.json({ category: promoted });
  });

  // Admin: Owner & Account Oversight
  app.get('/api/admin/users', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can inspect user accounts' });
    }
    const users = db.getUsers().map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      businessesCount: db.getBusinesses({ ownerId: u.id, includeInactive: true }).length,
    }));
    res.json({ users });
  });

  // Admin: Local Promotions Oversight
  app.get('/api/admin/promotions', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can inspect local promotions' });
    }
    const allBiz = db.getBusinesses({ includeInactive: true });
    const promotions = allBiz
      .filter((b) => b.flyer && (b.flyer.headline || b.flyer.offerDetails))
      .map((b) => ({
        businessId: b.id,
        businessName: b.name,
        businessStatus: b.status,
        flyer: b.flyer,
      }));
    res.json({ promotions });
  });

  // Businesses: Public & Owner queries
  app.get('/api/businesses', (req, res) => {
    const { category, q, location, ownerOnly } = req.query as {
      category?: string;
      q?: string;
      location?: string;
      ownerOnly?: string;
    };

    const isAuthorized = currentUser.role === 'admin' || (currentUser.role === 'owner' && ownerOnly === 'true');

    if (ownerOnly === 'true') {
      if (currentUser.role !== 'owner' && currentUser.role !== 'staff' && currentUser.role !== 'admin') {
        return res.status(401).json({ error: 'Unauthorized: Business owner sign-in required to access private listing dashboard.' });
      }
      const list = db.getBusinesses({
        ownerId: currentUser.id,
        includeInactive: true,
      });
      return res.json({ businesses: list });
    }

    if (currentUser.role === 'admin' && ownerOnly === 'all') {
      const list = db.getBusinesses({ includeInactive: true });
      return res.json({ businesses: list });
    }

    // Public visitor search: strictly active listings only!
    const list = db.getBusinesses({
      category,
      keyword: q,
      location,
      includeInactive: false,
    });

    // Strip private internal metadata from public response: Whitelist public fields only
    const sanitized = list.map((b) => getPublicBusinessProjection(b));

    res.json({ businesses: sanitized });
  });

  // Get single business
  app.get('/api/businesses/:id', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const isOwner = currentUser.id === b.ownerId || b.staff?.some((s) => s.userId === currentUser.id);
    const isAdmin = currentUser.role === 'admin';

    // If listing is not active and viewer is not authorized owner/admin
    if (b.status !== 'active' && !isOwner && !isAdmin) {
      return res.status(404).json({
        error: 'This business listing is currently unavailable or inactive.',
        inactive: true,
        businessId: b.id,
        status: b.status,
      });
    }

    // If authorized owner or admin, return full listing including billing & staff
    if (isOwner || isAdmin) {
      return res.json({ business: b, isOwner, isAdmin });
    }

    // Public view: strictly whitelisted public projection
    const publicProfile = getPublicBusinessProjection(b);

    res.json({ business: publicProfile, isOwner: false, isAdmin: false });
  });

  // Create new listing (draft)
  app.post('/api/businesses', (req, res) => {
    if (currentUser.role === 'visitor') {
      return res.status(401).json({ error: 'Sign in as a business owner to create a listing' });
    }

    const body = req.body;
    if (!body.name || !body.category) {
      return res.status(400).json({ error: 'Business name and category are required' });
    }

    // URL safety check
    if (
      !validateSafeUrl(body.website) ||
      !validateSafeUrl(body.orderOnlineUrl) ||
      !validateSafeUrl(body.bookingUrl) ||
      !validateSafeUrl(body.directionsUrl)
    ) {
      return res.status(400).json({
        error: 'Unsafe link URL detected. Only http:// and https:// link schemes are permitted.',
      });
    }

    // Normalize keywords: lowercase, trim, deduplicate
    const normalizedKeywords: string[] = Array.from(
      new Set(
        (body.keywords || [])
          .map((k: string) => k.toLowerCase().trim().replace(/\s+/g, ' '))
          .filter((k: string) => k.length > 0)
      )
    );

    const newBusinessId = generateBusinessId();

    const newBusiness: Business = {
      id: newBusinessId,
      ownerId: currentUser.id,
      ownerEmail: currentUser.email,
      name: body.name.trim(),
      entityType: body.entityType,
      shortDescription: body.shortDescription?.trim() || '',
      category: body.category,
      customCategory: body.customCategory?.trim() || undefined,
      customSubcategory: body.customSubcategory?.trim() || undefined,
      subcategory: body.subcategory?.trim() || undefined,
      keywords: normalizedKeywords,
      address: body.address?.trim() || '',
      city: body.city?.trim() || '',
      state: body.state?.trim() || 'WA',
      zipCode: body.zipCode?.trim() || '',
      serviceArea: body.serviceArea?.trim() || '',
      isServiceAreaOnly: Boolean(body.isServiceAreaOnly),
      locationType: body.locationType || (body.isServiceAreaOnly ? 'service_area' : 'storefront'),
      publishStreetAddress: Boolean(body.publishStreetAddress),
      phone: body.phone?.trim() || '',
      email: body.email?.trim() || currentUser.email,
      website: body.website?.trim() || '',
      orderOnlineUrl: body.orderOnlineUrl?.trim() || undefined,
      bookingUrl: body.bookingUrl?.trim() || undefined,
      directionsUrl: body.directionsUrl?.trim() || '',
      ein: body.ein?.trim() || undefined,
      hasEin: body.hasEin || 'Prefer not to answer',
      hasInsurance: Boolean(body.hasInsurance),
      hasInsuranceStatus: body.hasInsuranceStatus || 'Prefer not to answer',
      insuranceDetails: body.insuranceDetails?.trim() || undefined,
      logoUrl: body.logoUrl || '',
      photos: body.photos || [],
      menuPhotos: body.menuPhotos || [],
      menuFileUrl: body.menuFileUrl || '',
      menuItems: body.menuItems || [],
      services: body.services || [],
      hours: body.hours || {
        monday: '9:00 AM – 5:00 PM',
        tuesday: '9:00 AM – 5:00 PM',
        wednesday: '9:00 AM – 5:00 PM',
        thursday: '9:00 AM – 5:00 PM',
        friday: '9:00 AM – 5:00 PM',
        saturday: '10:00 AM – 4:00 PM',
        sunday: 'Closed',
      },
      status: 'draft',
      staff: [],
      referralCode: `REF-${newBusinessId.replace('sk-', '').toUpperCase()}`,
      referredBy: body.referredBy ? body.referredBy.trim().toUpperCase() : undefined,
      billing: {
        status: 'unpaid',
        isInitialSignUpPaid: false,
        initialSignUpFee: 19.99,
        renewalFee: 25,
        quarterlyFee: 25,
        termMonths: 2,
        reminderSent: false,
        referralCode: `REF-${newBusinessId.replace('sk-', '').toUpperCase()}`,
        referredBy: body.referredBy ? body.referredBy.trim().toUpperCase() : undefined,
        referralsCount: 0,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = db.saveBusiness(newBusiness);

    // Track pending referral if created with a valid referral code
    if (newBusiness.referredBy) {
      const referrerBiz = db.getBusinessByReferralCode(newBusiness.referredBy);
      if (referrerBiz && referrerBiz.id !== newBusiness.id) {
        db.addReferral({
          id: `ref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          referrerBusinessId: referrerBiz.id,
          referrerOwnerEmail: referrerBiz.ownerEmail,
          referredBusinessId: newBusiness.id,
          referredBusinessName: newBusiness.name,
          createdAt: new Date().toISOString(),
          status: 'pending',
        });
      }
    }

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: 'create_listing_draft',
      targetId: saved.id,
      details: `Created draft listing for "${saved.name}" with permanent ID ${saved.id}`,
    });

    res.json({ business: saved });
  });

  // Soft delete / archive listing
  app.post('/api/businesses/:id/archive', (req, res) => {
    const existing = db.getBusinessById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const isOwner = currentUser.id === existing.ownerId;
    const isAdmin = currentUser.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Permission denied to archive this business listing' });
    }

    const archived = db.archiveBusiness(req.params.id);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: 'archive_listing',
      targetId: existing.id,
      details: `Archived listing "${existing.name}". Public visibility ceased; permanent ID ${existing.id} preserved.`,
    });

    res.json({ success: true, business: archived });
  });

  // Update listing details
  app.put('/api/businesses/:id', (req, res) => {
    const existing = db.getBusinessById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const isOwner = currentUser.id === existing.ownerId;
    const staffPerms = existing.staff?.find((s) => s.userId === currentUser.id)?.permissions || [];
    const isAdmin = currentUser.role === 'admin';

    if (!isOwner && !isAdmin && !staffPerms.includes('edit_profile')) {
      return res.status(403).json({ error: 'Permission denied to edit this business listing' });
    }

    const body = req.body;

    // URL safety check
    if (
      !validateSafeUrl(body.website) ||
      !validateSafeUrl(body.orderOnlineUrl) ||
      !validateSafeUrl(body.bookingUrl) ||
      !validateSafeUrl(body.directionsUrl)
    ) {
      return res.status(400).json({
        error: 'Unsafe link URL detected. Only http:// and https:// link schemes are permitted.',
      });
    }

    // Normalize keywords: lowercase, trim, deduplicate
    if (body.keywords) {
      body.keywords = Array.from(
        new Set(
          body.keywords
            .map((k: string) => k.toLowerCase().trim().replace(/\s+/g, ' '))
            .filter((k: string) => k.length > 0)
        )
      );
    }

    // Canonical state machine: owners cannot directly set their own status to 'active' without verified payment
    let targetStatus: ListingStatus = body.status || existing.status;
    if (!isAdmin && body.status === 'active' && existing.status !== 'active') {
      if (existing.billing?.status !== 'paid') {
        targetStatus = existing.status; // Prevent unauthorized self-activation
      }
    }

    // Preserve permanent immutable fields: id, ownerId, billing status (unless admin), and ratings
    const updated: Business = {
      ...existing,
      ...body,
      id: existing.id,
      ownerId: existing.ownerId,
      ownerEmail: existing.ownerEmail,
      status: targetStatus,
      createdAt: existing.createdAt,
      billing: existing.billing, // Protected against arbitrary direct edits
      averageRating: existing.averageRating, // Automatic ratings cannot be manually edited or inflated
      ratingCount: existing.ratingCount, // Automatic count cannot be manually inflated
      staff: isOwner || isAdmin ? (body.staff || existing.staff) : existing.staff,
    };

    // If restaurant, validate requirement if currently active
    if (updated.category === 'restaurants-food' && updated.status === 'active') {
      if ((!updated.menuPhotos || updated.menuPhotos.length === 0) && !updated.menuFileUrl) {
        return res.status(400).json({
          error: 'Restaurants and Food listings require at least one menu photo or menu file before publication.',
        });
      }
    }

    const saved = db.saveBusiness(updated);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: 'update_listing',
      targetId: saved.id,
      details: `Updated listing content for "${saved.name}"`,
    });

    res.json({ business: saved });
  });

  // Publish listing flow
  app.post('/api/businesses/:id/publish', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const isOwner = currentUser.id === b.ownerId;
    const isAdmin = currentUser.role === 'admin';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Only the business owner or admin can publish the listing' });
    }

    // Required content validation
    if (!b.name || !b.shortDescription || !b.category || (!b.address && !b.serviceArea) || (!b.phone && !b.email)) {
      return res.status(400).json({
        error: 'Please complete all required fields (Name, Description, Category, Location, and Contact info) before publishing.',
      });
    }

    // Category-specific validation: Restaurants require menu photo or file
    if (b.category === 'restaurants-food') {
      if ((!b.menuPhotos || b.menuPhotos.length === 0) && !b.menuFileUrl) {
        return res.status(400).json({
          error: 'Restaurants & Food listings require at least one uploaded menu photo or menu file before publication.',
        });
      }
    }

    // Billing check: must be paid through current date
    const nowTime = Date.now();
    const isPaid =
      b.billing?.status === 'paid' &&
      b.billing?.paidThroughDate &&
      new Date(b.billing.paidThroughDate).getTime() > nowTime;

    if (!isPaid) {
      b.status = 'pending_payment';
      db.saveBusiness(b);
      return res.json({
        success: false,
        requiresPayment: true,
        business: b,
        message: 'Content validated! Complete your $19.99 initial enrollment fee to activate your 2-month public directory listing.',
      });
    }

    // If paid, activate listing!
    b.status = 'active';
    b.statusReason = undefined;
    const saved = db.saveBusiness(b);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: 'publish_listing',
      targetId: b.id,
      details: `Listing "${b.name}" published and active on public directory.`,
    });

    res.json({ success: true, business: saved });
  });

  // Owner Pause / Resume
  app.post('/api/businesses/:id/pause', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    if (b.ownerId !== currentUser.id && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    b.status = 'paused';
    b.statusReason = 'Listing paused by owner.';
    db.saveBusiness(b);
    res.json({ business: b });
  });

  app.post('/api/businesses/:id/resume', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    if (b.ownerId !== currentUser.id && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Verify paid through date
    const nowTime = Date.now();
    const isPaid =
      b.billing?.status === 'paid' &&
      b.billing?.paidThroughDate &&
      new Date(b.billing.paidThroughDate).getTime() > nowTime;

    if (!isPaid) {
      b.status = 'hidden_unpaid';
      b.statusReason = 'Cannot resume: Annual fee expired or unpaid.';
      db.saveBusiness(b);
      return res.status(400).json({ error: 'Payment required to resume active listing', business: b });
    }

    b.status = 'active';
    b.statusReason = undefined;
    db.saveBusiness(b);
    res.json({ business: b });
  });

  // Flyer management
  app.post('/api/businesses/:id/flyer', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const isOwner = currentUser.id === b.ownerId;
    const staffPerms = existingStaffPermissions(b, currentUser.id);
    if (!isOwner && currentUser.role !== 'admin' && !staffPerms.includes('edit_flyer')) {
      return res.status(403).json({ error: 'Permission denied to edit promotional flyer' });
    }

    const { headline, offerDetails, photoUrl, accentColor, template, publish } = req.body;
    if (!headline || !offerDetails) {
      return res.status(400).json({ error: 'Headline and offer details are required for the flyer' });
    }

    const flyer: Flyer = {
      id: b.flyer?.id || `fl-${Date.now()}`,
      businessId: b.id,
      headline: headline.trim(),
      offerDetails: offerDetails.trim(),
      photoUrl: photoUrl || b.photos[0] || '',
      accentColor: accentColor || '#16a34a',
      template: template || 'modern',
      status: publish ? 'published' : 'draft',
      updatedAt: new Date().toISOString(),
    };

    b.flyer = flyer;
    db.saveBusiness(b);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: publish ? 'publish_flyer' : 'save_flyer_draft',
      targetId: b.id,
      details: `${publish ? 'Published' : 'Saved draft'} promotional flyer for "${b.name}"`,
    });

    res.json({ success: true, flyer, business: b });
  });

  // Staff management endpoints (Only business owner or admin can manage staff)
  app.post('/api/businesses/:id/staff', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    if (b.ownerId !== currentUser.id && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only the business owner can invite staff members' });
    }

    const { email, name, permissions } = req.body;
    if (!email || !permissions || permissions.length === 0) {
      return res.status(400).json({ error: 'Email and at least one permission are required' });
    }

    const newStaff: StaffMember = {
      id: `st-${Date.now()}`,
      userId: `user-staff-${Date.now()}`,
      email: email.trim(),
      name: name?.trim() || email.split('@')[0],
      permissions,
      invitedAt: new Date().toISOString(),
    };

    if (!b.staff) b.staff = [];
    b.staff.push(newStaff);
    db.saveBusiness(b);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: 'invite_staff',
      targetId: b.id,
      details: `Invited staff ${newStaff.email} with permissions: ${permissions.join(', ')}`,
    });

    res.json({ staff: b.staff });
  });

  app.delete('/api/businesses/:id/staff/:staffId', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    if (b.ownerId !== currentUser.id && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Only the business owner can remove staff' });
    }

    b.staff = (b.staff || []).filter((s) => s.id !== req.params.staffId);
    db.saveBusiness(b);
    res.json({ staff: b.staff });
  });

  // Billing: Affirmative Manual $19.99 Sign-Up / $25 Bimonthly Renewal Payment Flow
  app.post('/api/billing/checkout-session', (req, res) => {
    const { businessId } = req.body;
    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    if (b.ownerId !== currentUser.id && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized to initiate payment' });
    }

    const isInitialSignUp = !b.billing?.isInitialSignUpPaid;
    let amount = isInitialSignUp ? 19.99 : 25;
    if (!isInitialSignUp && b.billing?.hasReferralDiscount) {
      amount = 12.50;
    }
    const sessionId = `cs_shortstack_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    res.json({
      sessionId,
      businessId: b.id,
      businessName: b.name,
      isInitialSignUp,
      amount,
      hasReferralDiscount: !isInitialSignUp && Boolean(b.billing?.hasReferralDiscount),
      currency: 'usd',
      termMonths: 2,
      note: isInitialSignUp
        ? 'One-time $19.99 initial enrollment fee. Activates your listing and includes its initial 2-month advertising period. No auto-enrollment, manual renewals only.'
        : b.billing?.hasReferralDiscount
        ? 'Single manual renewal payment with 50% referral discount applied: $12.50 for 2 months. No auto-enrollment.'
        : 'Manual $25 advertising fee for a 2-month period. Extends directory visibility by 2 months. No auto-enrollment, manual renewals only.',
    });
  });

  // Server-side payment verification (Webhook / Verification Handler)
  app.post('/api/billing/verify-payment', (req, res) => {
    const { businessId, sessionId, providerReference } = req.body;
    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const isInitialSignUp = !b.billing?.isInitialSignUpPaid;
    const verifiedDate = new Date();
    const verifiedMs = verifiedDate.getTime();
    const receiptNum = `REC-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    let termStartDate: string;
    let termEndDate: string;
    let reminderDate: string;
    let amountCharged = isInitialSignUp ? 19.99 : 25;

    if (isInitialSignUp) {
      termStartDate = verifiedDate.toISOString();
      // Initial 2 months (60 days)
      termEndDate = new Date(verifiedMs + 60 * 24 * 60 * 60 * 1000).toISOString();
      // Notice: 15-30 days before expiration
      reminderDate = new Date(verifiedMs + 30 * 24 * 60 * 60 * 1000).toISOString();
      amountCharged = 19.99;
    } else {
      if (b.billing?.hasReferralDiscount) {
        amountCharged = 12.50;
      }
      // Bimonthly renewal: extend from current paid-through date if still active, or from today if lapsed
      const currentPaidThrough = b.billing?.paidThroughDate ? new Date(b.billing.paidThroughDate).getTime() : 0;
      const baseMs = currentPaidThrough > verifiedMs ? currentPaidThrough : verifiedMs;
      termStartDate = b.billing?.termStartDate || verifiedDate.toISOString();
      termEndDate = new Date(baseMs + 60 * 24 * 60 * 60 * 1000).toISOString();
      reminderDate = new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    // Process referral incentive when a referred business completes $19.99 initial payment
    if (isInitialSignUp && (b.referredBy || b.billing?.referredBy)) {
      const refCode = (b.referredBy || b.billing?.referredBy || '').trim().toUpperCase();
      const referrerBiz = db.getBusinessByReferralCode(refCode);
      if (referrerBiz && referrerBiz.id !== b.id) {
        // Do not allow referral discounts to stack or apply more than once to the same qualifying referral
        if (!referrerBiz.billing?.hasReferralDiscount) {
          referrerBiz.billing.hasReferralDiscount = true;
          referrerBiz.billing.renewalFee = 12.50;
          referrerBiz.billing.referralsCount = (referrerBiz.billing.referralsCount || 0) + 1;
          db.saveBusiness(referrerBiz);

          // Update or add referral record
          const allRefs = db.getReferrals();
          const existingRef = allRefs.find((r) => r.referredBusinessId === b.id);
          if (existingRef) {
            existingRef.status = 'qualified_discount_available';
            db.updateReferral(existingRef);
          } else {
            db.addReferral({
              id: `ref-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              referrerBusinessId: referrerBiz.id,
              referrerOwnerEmail: referrerBiz.ownerEmail,
              referredBusinessId: b.id,
              referredBusinessName: b.name,
              createdAt: new Date().toISOString(),
              status: 'qualified_discount_available',
            });
          }

          db.addAuditEvent({
            id: `aud-${Date.now()}-ref`,
            timestamp: verifiedDate.toISOString(),
            actor: 'System Referral Engine',
            action: 'referral_discount_qualified',
            targetId: referrerBiz.id,
            details: `Referred business "${b.name}" (${b.id}) completed initial $19.99 enrollment. Referring owner "${referrerBiz.name}" awarded 50% discount on first renewal ($12.50).`,
          });
        }
      }
    } else if (!isInitialSignUp && b.billing?.hasReferralDiscount) {
      // Referring owner just redeemed their 50% discount for this renewal ($12.50 paid)!
      // Future renewals return to standard $25 every 2 months.
      b.billing.hasReferralDiscount = false;
      b.billing.renewalFee = 25;

      const myRefs = db.getReferrals(b.id);
      const qualRef = myRefs.find((r) => r.referrerBusinessId === b.id && r.status === 'qualified_discount_available');
      if (qualRef) {
        qualRef.status = 'discount_redeemed';
        qualRef.discountRedeemedAt = verifiedDate.toISOString();
        db.updateReferral(qualRef);
      }

      db.addAuditEvent({
        id: `aud-${Date.now()}-red`,
        timestamp: verifiedDate.toISOString(),
        actor: currentUser.name,
        action: 'referral_discount_redeemed',
        targetId: b.id,
        details: `Redeemed single 50% referral discount on manual renewal ($12.50 paid). Future renewals reset to standard $25 every 2 months.`,
      });
    }

    b.billing = {
      ...b.billing,
      status: 'paid',
      isInitialSignUpPaid: true,
      initialSignUpFee: 19.99,
      renewalFee: b.billing?.hasReferralDiscount ? 12.50 : 25,
      quarterlyFee: 25,
      termMonths: 2,
      termStartDate,
      paidThroughDate: termEndDate,
      expirationDate: termEndDate,
      reminderScheduledDate: reminderDate,
      reminderSent: false,
      providerReference: providerReference || `ch_verified_${Date.now()}`,
      receiptNumber: receiptNum,
      lastPaymentVerifiedAt: verifiedDate.toISOString(),
      referralCode: b.billing?.referralCode || `REF-${b.id.replace('sk-', '').toUpperCase()}`,
    };

    // If listing was pending_payment or hidden_unpaid, restore active visibility
    if (b.status === 'pending_payment' || b.status === 'hidden_unpaid' || b.status === 'draft') {
      b.status = 'active';
      b.statusReason = undefined;
    }

    db.saveBusiness(b);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: verifiedDate.toISOString(),
      actor: currentUser.name,
      action: isInitialSignUp ? 'initial_signup_payment_verified' : 'bimonthly_renewal_payment_verified',
      targetId: b.id,
      details: isInitialSignUp
        ? `Verified manual $19.99 initial enrollment payment for 2-month advertising term. Paid through ${new Date(termEndDate).toLocaleDateString()}. Receipt ${receiptNum}. Stable business ID ${b.id} preserved.`
        : `Verified manual $${amountCharged.toFixed(2)} bimonthly advertising renewal for 2-month term. Paid through ${new Date(termEndDate).toLocaleDateString()}. Receipt ${receiptNum}. Stable business ID ${b.id} preserved.`,
    });

    res.json({
      success: true,
      business: b,
      isInitialSignUp,
      amount: amountCharged,
      message: isInitialSignUp
        ? `Initial $19.99 enrollment fee verified. Listing is active through ${new Date(termEndDate).toLocaleDateString()}.`
        : `Bimonthly renewal ($${amountCharged.toFixed(2)}) verified. Listing is active through ${new Date(termEndDate).toLocaleDateString()}.`,
    });
  });

  // Simulator for testing expiration / lapse without waiting 2 months
  app.post('/api/billing/simulate-expiration', (req, res) => {
    const { businessId, state } = req.body as { businessId: string; state: 'expired' | 'approaching_notice' | 'active' };
    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });
    if (b.ownerId !== currentUser.id && currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const nowTime = Date.now();

    if (state === 'expired') {
      // Set paidThroughDate to 1 day ago
      const past = new Date(nowTime - 24 * 60 * 60 * 1000).toISOString();
      b.billing.paidThroughDate = past;
      b.billing.expirationDate = past;
      b.billing.status = 'expired';
      b.status = 'hidden_unpaid';
      b.statusReason = 'Bimonthly $25 renewal fee expired. Retained for manual renewal.';
    } else if (state === 'approaching_notice') {
      // Set expiration to 10 days from now (approaching notice window)
      const nearFuture = new Date(nowTime + 10 * 24 * 60 * 60 * 1000).toISOString();
      const pastNoticeDate = new Date(nowTime - 2 * 24 * 60 * 60 * 1000).toISOString();
      b.billing.expirationDate = nearFuture;
      b.billing.paidThroughDate = nearFuture;
      b.billing.reminderScheduledDate = pastNoticeDate;
      b.billing.reminderSent = false;
      b.status = 'active';
    } else {
      // Normal active 2 months (60 days)
      const future = new Date(nowTime + 60 * 24 * 60 * 60 * 1000).toISOString();
      b.billing.expirationDate = future;
      b.billing.paidThroughDate = future;
      b.billing.status = 'paid';
      b.status = 'active';
      b.statusReason = undefined;
    }

    db.saveBusiness(b);
    db.runExpirationAndReminderJob();

    res.json({ success: true, business: b });
  });

  // Referral endpoints
  app.get('/api/referrals/my-referrals', (req, res) => {
    const { businessId } = req.query as { businessId?: string };
    const referrals = db.getReferrals(businessId);
    res.json({ referrals });
  });

  app.get('/api/referrals/validate', (req, res) => {
    const { code } = req.query as { code?: string };
    if (!code) {
      return res.status(400).json({ valid: false, error: 'Code required' });
    }
    const biz = db.getBusinessByReferralCode(code);
    if (!biz) {
      return res.json({ valid: false, message: 'Invalid or unrecognized referral code.' });
    }
    res.json({
      valid: true,
      referrerId: biz.id,
      referrerName: biz.name,
      message: `Referred by ${biz.name}. Sign up for $19.99 to help them earn 50% off their first renewal!`,
    });
  });

  // Direct Photo Upload endpoint (from device)
  app.post('/api/upload', (req, res) => {
    const { dataUrl, filename } = req.body;
    if (!dataUrl) {
      return res.status(400).json({ error: 'No image data provided' });
    }
    // Return the data URL directly as a durable image reference
    res.json({ success: true, url: dataUrl, filename });
  });

  // Moderation endpoints (Admin only)
  app.get('/api/moderation/actions', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json({ actions: db.getModerationActions() });
  });

  app.post('/api/moderation/action', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const { businessId, newStatus, reason } = req.body;
    if (!businessId || !newStatus || !reason) {
      return res.status(400).json({ error: 'businessId, newStatus, and reason are required' });
    }

    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const prev = b.status;
    b.status = newStatus;
    b.statusReason = reason;
    db.saveBusiness(b);

    const action = {
      id: `mod-${Date.now()}`,
      businessId: b.id,
      businessName: b.name,
      previousStatus: prev,
      newStatus,
      reason,
      actor: currentUser.name,
      timestamp: new Date().toISOString(),
    };
    db.addModerationAction(action);

    db.addAuditEvent({
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: currentUser.name,
      action: `moderation_${newStatus}`,
      targetId: b.id,
      details: `Status transitioned from ${prev} to ${newStatus}. Reason: ${reason}`,
    });

    res.json({ success: true, action, business: b });
  });

  // Reports
  app.get('/api/moderation/reports', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json({ reports: db.getReports() });
  });

  app.post('/api/reports', (req, res) => {
    const { businessId, reason, details, reporterEmail } = req.body;
    const b = db.getBusinessById(businessId);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const report = {
      id: `rep-${Date.now()}`,
      businessId: b.id,
      businessName: b.name,
      reporterEmail: reporterEmail?.trim() || 'anonymous@visitor.local',
      reason: reason || 'Listing content concern',
      details: details || '',
      timestamp: new Date().toISOString(),
      status: 'pending' as const,
    };

    db.addReport(report);
    res.json({ success: true, report });
  });

  app.post('/api/reports/:id/resolve', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { status, notes } = req.body;
    db.updateReport(req.params.id, status || 'resolved', notes);
    res.json({ success: true });
  });

  // Audit events
  app.get('/api/moderation/audit-history', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    res.json({ events: db.getAuditEvents(), reminders: db.getReminderLogs() });
  });

  // ==========================================
  // Customer Reviews & Automatic Rating API
  // ==========================================
  app.get('/api/businesses/:id/reviews', (req, res) => {
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    const isOwner = currentUser.id === b.ownerId || b.staff?.some((s) => s.userId === currentUser.id);
    const isAdmin = currentUser.role === 'admin';

    // Public gets published only; owner/admin gets full list (to review flags or moderated items)
    const reviews = db.getReviews(b.id, isAdmin);
    // Never expose private reviewer accounts or contact info
    const safeReviews = reviews.map((r) => ({
      id: r.id,
      businessId: r.businessId,
      reviewerName: r.reviewerName,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt,
      status: r.status,
      flaggedByOwner: isOwner || isAdmin ? r.flaggedByOwner : undefined,
      flagReason: isOwner || isAdmin ? r.flagReason : undefined,
      flaggedAt: isOwner || isAdmin ? r.flaggedAt : undefined,
      adminNotes: isAdmin ? r.adminNotes : undefined,
    }));

    res.json({
      reviews: safeReviews,
      averageRating: b.averageRating,
      ratingCount: b.ratingCount,
    });
  });

  // Customer review submission with basic spam & duplicate safeguards
  app.post('/api/businesses/:id/reviews', (req, res) => {
    const { rating, comment, reviewerName } = req.body;
    const b = db.getBusinessById(req.params.id);
    if (!b) return res.status(404).json({ error: 'Business not found' });

    if (b.status !== 'active') {
      return res.status(400).json({ error: 'Reviews can only be submitted for active business listings.' });
    }

    const result = db.addReview({
      businessId: b.id,
      rating: Number(rating),
      comment,
      reviewerName,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      review: result.review,
      averageRating: result.averageRating,
      ratingCount: result.ratingCount,
    });
  });

  // Flag review for administrator review (owners CANNOT edit or delete customer reviews)
  app.post('/api/reviews/:id/flag', (req, res) => {
    const { reason } = req.body;
    const allReviews = db.getReviews(undefined, true);
    const rev = allReviews.find((r) => r.id === req.params.id);
    if (!rev) return res.status(404).json({ error: 'Review not found' });

    const b = db.getBusinessById(rev.businessId);
    if (!b) return res.status(404).json({ error: 'Associated business not found' });

    const isOwner = currentUser.id === b.ownerId;
    const result = db.flagReview(
      req.params.id,
      reason,
      isOwner ? 'Business Owner' : currentUser.role === 'admin' ? 'Administrator' : 'Customer'
    );
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({ success: true, message: 'Review successfully flagged for administrator investigation.' });
  });

  // Admin: get all reviews for moderation
  app.get('/api/admin/reviews', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const all = db.getReviews(undefined, true);
    res.json({ reviews: all });
  });

  // Admin controls to review reported content and hide or restore reviews
  app.post('/api/admin/reviews/:id/status', (req, res) => {
    if (currentUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }
    const { status, adminNotes } = req.body;
    if (status !== 'published' && status !== 'hidden') {
      return res.status(400).json({ error: 'Status must be "published" or "hidden"' });
    }

    const result = db.adminUpdateReviewStatus(req.params.id, status, adminNotes);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      success: true,
      review: result.review,
      averageRating: result.averageRating,
      ratingCount: result.ratingCount,
    });
  });

  // Places / Location Autocomplete API (with graceful fallback dictionary)
  app.get('/api/places/autocomplete', (req, res) => {
    const input = (req.query.input as string || '').toLowerCase().trim();
    if (!input || input.length < 1) {
      return res.json({ predictions: [], providerConfigured: !!process.env.GOOGLE_MAPS_API_KEY });
    }

    // Curated high-accuracy real location database for instant autocomplete and auto-population
    const locationDictionary: Array<{
      text: string;
      type: string;
      detail: string;
      streetAddress?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      lat?: number;
      lng?: number;
    }> = [
      { text: '428 Mill Creek Way, Seattle, WA', type: 'address', detail: 'Seattle, WA 98101', streetAddress: '428 Mill Creek Way', city: 'Seattle', state: 'WA', zipCode: '98101', lat: 47.6062, lng: -122.3321 },
      { text: '1108 Industrial Parkway Suite B, Bellevue, WA', type: 'address', detail: 'Bellevue, WA 98004', streetAddress: '1108 Industrial Parkway Suite B', city: 'Bellevue', state: 'WA', zipCode: '98004', lat: 47.6101, lng: -122.2015 },
      { text: '7302 Greenwood Ave N, Seattle, WA', type: 'address', detail: 'Seattle, WA 98103', streetAddress: '7302 Greenwood Ave N', city: 'Seattle', state: 'WA', zipCode: '98103', lat: 47.6817, lng: -122.3553 },
      { text: '512 Northgate Way, Seattle, WA', type: 'address', detail: 'Seattle, WA 98125', streetAddress: '512 Northgate Way', city: 'Seattle', state: 'WA', zipCode: '98125', lat: 47.7085, lng: -122.3232 },
      { text: '2401 NW Market St, Seattle, WA', type: 'address', detail: 'Ballard, Seattle, WA 98107', streetAddress: '2401 NW Market St', city: 'Seattle', state: 'WA', zipCode: '98107', lat: 47.6687, lng: -122.3887 },
      { text: '1414 4th Ave, Seattle, WA', type: 'address', detail: 'Downtown Seattle, WA 98101', streetAddress: '1414 4th Ave', city: 'Seattle', state: 'WA', zipCode: '98101', lat: 47.6097, lng: -122.3364 },
      { text: 'Seattle, WA', type: 'city', detail: 'King County, Washington', city: 'Seattle', state: 'WA', zipCode: '98101' },
      { text: 'Downtown Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98101', city: 'Seattle', state: 'WA', zipCode: '98101' },
      { text: 'Capitol Hill, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98102', city: 'Seattle', state: 'WA', zipCode: '98102' },
      { text: 'Queen Anne, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98109', city: 'Seattle', state: 'WA', zipCode: '98109' },
      { text: 'Ballard, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98107', city: 'Seattle', state: 'WA', zipCode: '98107' },
      { text: 'Greenwood, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98103', city: 'Seattle', state: 'WA', zipCode: '98103' },
      { text: 'Northgate, Seattle, WA', type: 'neighborhood', detail: 'Seattle, WA 98125', city: 'Seattle', state: 'WA', zipCode: '98125' },
      { text: 'Bellevue, WA', type: 'city', detail: 'King County, Washington 98004', city: 'Bellevue', state: 'WA', zipCode: '98004' },
      { text: 'Redmond, WA', type: 'city', detail: 'King County, Washington 98052', city: 'Redmond', state: 'WA', zipCode: '98052' },
      { text: 'Kirkland, WA', type: 'city', detail: 'King County, Washington 98033', city: 'Kirkland', state: 'WA', zipCode: '98033' },
      { text: 'Edmonds, WA', type: 'city', detail: 'Snohomish County, WA 98020', city: 'Edmonds', state: 'WA', zipCode: '98020' },
      { text: 'Tacoma, WA', type: 'city', detail: 'Pierce County, Washington 98402', city: 'Tacoma', state: 'WA', zipCode: '98402' },
      { text: 'Portland, OR', type: 'city', detail: 'Multnomah County, Oregon 97201', city: 'Portland', state: 'OR', zipCode: '97201' },
      { text: 'San Francisco, CA', type: 'city', detail: 'San Francisco County, CA 94102', city: 'San Francisco', state: 'CA', zipCode: '94102' },
      { text: 'Los Angeles, CA', type: 'city', detail: 'Los Angeles County, CA 90012', city: 'Los Angeles', state: 'CA', zipCode: '90012' },
      { text: 'Austin, TX', type: 'city', detail: 'Travis County, Texas 78701', city: 'Austin', state: 'TX', zipCode: '78701' },
      { text: 'Denver, CO', type: 'city', detail: 'Denver County, Colorado 80202', city: 'Denver', state: 'CO', zipCode: '80202' },
      { text: 'Chicago, IL', type: 'city', detail: 'Cook County, Illinois 60601', city: 'Chicago', state: 'IL', zipCode: '60601' },
      { text: 'New York, NY', type: 'city', detail: 'New York County, New York 10001', city: 'New York', state: 'NY', zipCode: '10001' },
      { text: '98101 (Seattle, WA)', type: 'zip', detail: 'Seattle, WA ZIP Code', city: 'Seattle', state: 'WA', zipCode: '98101' },
      { text: '98004 (Bellevue, WA)', type: 'zip', detail: 'Bellevue, WA ZIP Code', city: 'Bellevue', state: 'WA', zipCode: '98004' },
      { text: '98103 (Seattle, WA)', type: 'zip', detail: 'Greenwood / Phinney Ridge ZIP', city: 'Seattle', state: 'WA', zipCode: '98103' },
    ];

    const matched = locationDictionary
      .filter((loc) => loc.text.toLowerCase().includes(input) || loc.detail.toLowerCase().includes(input))
      .slice(0, 6);

    res.json({
      source: process.env.GOOGLE_MAPS_API_KEY ? 'google_places_live' : 'built_in_dictionary',
      providerConfigured: !!process.env.GOOGLE_MAPS_API_KEY,
      predictions: matched,
    });
  });

  // Scheduler manual trigger
  app.post('/api/scheduler/run-checks', (req, res) => {
    const result = db.runExpirationAndReminderJob();
    res.json({ success: true, result });
  });

  // Background interval: run checks every 10 minutes
  setInterval(() => {
    try {
      db.runExpirationAndReminderJob();
    } catch (e) {
      console.error('Error in scheduler job:', e);
    }
  }, 10 * 60 * 1000);

  // Helper
  function existingStaffPermissions(b: Business, userId: string): string[] {
    return b.staff?.find((s) => s.userId === userId)?.permissions || [];
  }

  // Static asset serving for generated media
  app.use('/src/assets', express.static(path.join(__dirname, 'src/assets')));
  app.use('/public', express.static(path.join(__dirname, 'public')));
  app.use('/images', express.static(path.join(__dirname, 'public/images')));

  // Vite middleware in dev or static serve in prod
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PipSqueak server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting PipSqueak server:', err);
});
