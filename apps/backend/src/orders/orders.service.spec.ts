import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { DbService } from "../db/db.service";
import { AuditService } from "../audit/audit.service";
import { OrdersService } from "./orders.service";

describe("OrdersService — full lifecycle & business rules", () => {
  let db: DbService;
  let audit: AuditService;
  let service: OrdersService;

  const adminActor = {
    id: "admin-1",
    full_name: "Admin Boss",
    role: "super_admin" as const,
  };

  const staffActor = {
    id: "staff-1",
    full_name: "Staff Member",
    role: "staff" as const,
  };

  beforeAll(() => {
    process.env.DB_PATH = ":memory:";
    db = new DbService();
    audit = new AuditService(db);
    service = new OrdersService(db, audit);
  });

  afterAll(() => {
    db.raw.close();
  });

  it("creates a draft order with auto-generated ticket number CMD-YYYY-0001", async () => {
    const order = await service.createOrder(
      {
        customer_name: "Foulen Ben Foulen",
        customer_phone: "20123456",
        description: "Impression flyers A5",
        order_type: "local",
      },
      staffActor,
    );

    const year = new Date().getFullYear();
    expect(order.ticket_no).toBe(`CMD-${year}-0001`);
    expect(order.customer_name).toBe("Foulen Ben Foulen");
    expect(order.status).toBe("pending");
    expect(order.total_amount).toBe(0);
    expect(order.paid).toBe(0);
    expect(order.reste).toBe(0);
    expect(order.events).toHaveLength(1);
    expect(order.events[0].type).toBe("created");
  });

  it("increments sequence atomically on next order", async () => {
    const order = await service.createOrder(
      {
        customer_name: "Second Client",
        order_type: "online",
        delivery_address: "10 Rue de la Liberté, Tunis",
        delivery_fee: 7000,
        items: [
          { label: "Menu dépliant", quantity: 100, unit_price: 500 },
        ],
      },
      staffActor,
    );

    const year = new Date().getFullYear();
    expect(order.ticket_no).toBe(`CMD-${year}-0002`);
    expect(order.total_amount).toBe(50000);
    expect(order.delivery_fee).toBe(7000);
    expect(order.grand_total).toBe(57000);
    expect(order.reste).toBe(57000);
    expect(order.items).toHaveLength(1);
  });

  it("refuses creation without client info and without items", async () => {
    await expect(service.createOrder({}, staffActor)).rejects.toThrow(
      "Renseignez au moins un client, une description ou un article",
    );
  });

  it("refuses online order without delivery address", async () => {
    await expect(
      service.createOrder(
        {
          customer_name: "Online Client",
          order_type: "online",
        },
        staffActor,
      ),
    ).rejects.toThrow("L'adresse de livraison est obligatoire pour une commande en ligne");
  });

  it("refuses confirmation of a draft with 0 items", async () => {
    const draft = await service.createOrder(
      { customer_name: "Draft 0 items" },
      staffActor,
    );

    await expect(service.confirmOrder(draft.id, staffActor)).rejects.toThrow(
      "Ajoutez au moins un article avant de confirmer",
    );
  });

  it("supports full order workflow: items, confirm, start, ready, pay, deliver", async () => {
    // 1. Create with items
    const order = await service.createOrder(
      {
        customer_name: "Client Complet",
        items: [{ label: "Banderole", quantity: 1, unit_price: 30000 }],
      },
      staffActor,
    );

    // 2. Confirm
    const confirmed = await service.confirmOrder(order.id, staffActor);
    expect(confirmed.status).toBe("confirmed");

    // 3. Start
    const started = await service.startOrder(order.id, staffActor);
    expect(started.status).toBe("in_progress");

    // 4. Ready
    const ready = await service.readyOrder(order.id, staffActor);
    expect(ready.status).toBe("ready");

    // 5. Try delivering while unpaid without force -> fails
    await expect(service.deliverOrder(order.id, staffActor, false)).rejects.toThrow(
      "Le solde doit être réglé avant la livraison",
    );

    // 6. Pay advance
    await service.recordPayment(
      order.id,
      { kind: "advance", amount: 10000, note: "Espèces" },
      staffActor,
    );

    // 7. Pay balance
    await service.recordPayment(
      order.id,
      { kind: "balance", amount: 20000, note: "Virement" },
      staffActor,
    );

    // 8. Deliver succeeds now that reste <= 0
    const delivered = await service.deliverOrder(order.id, staffActor, false);
    expect(delivered.status).toBe("delivered");
    expect(delivered.paid).toBe(30000);
    expect(delivered.reste).toBe(0);
  });

  it("enforces edit rules: cannot change order_type after confirmation", async () => {
    const order = await service.createOrder(
      {
        customer_name: "Client Test Rules",
        order_type: "local",
        items: [{ label: "Sticker", quantity: 10, unit_price: 1000 }],
      },
      staffActor,
    );

    await service.confirmOrder(order.id, staffActor);

    await expect(
      service.updateOrder(order.id, { order_type: "online", delivery_address: "Sousse" }, staffActor),
    ).rejects.toThrow("Le type de commande ne peut plus être modifié après confirmation");
  });

  it("enforces payment rules: refund cannot exceed paid amount", async () => {
    const order = await service.createOrder(
      {
        customer_name: "Client Refund",
        items: [{ label: "Carte de visite", quantity: 1, unit_price: 15000 }],
      },
      staffActor,
    );

    await service.recordPayment(order.id, { kind: "advance", amount: 5000 }, staffActor);

    await expect(
      service.recordPayment(order.id, { kind: "refund", amount: 8000 }, staffActor),
    ).rejects.toThrow("Le remboursement dépasse le montant payé");
  });

  it("lists orders with status and search filters", async () => {
    const res = await service.listOrders({
      search: "Client Refund",
    });

    expect(res.data.length).toBeGreaterThan(0);
    expect(res.data[0].customer_name).toBe("Client Refund");
    expect(res.data[0].paid).toBe(5000);
    expect(res.meta.total).toBeGreaterThan(0);
  });
});
