<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Every way stock can move. There is no silent stock change anywhere in the
 * system: each one of these writes an inventory_transactions row, and most
 * also post to the general ledger.
 */
enum InventoryTransactionType: string
{
    case Opening = 'opening';
    case Purchase = 'purchase';
    case PurchaseReturn = 'purchase_return';
    case Sale = 'sale';
    case SaleReturn = 'sale_return';

    /** Shipped: value moves Inventory -> Goods in Transit. Not a transfer. */
    case TransitOut = 'transit_out';

    /** Failed delivery came back: Goods in Transit -> Inventory. */
    case TransitIn = 'transit_in';

    case Adjustment = 'adjustment';
    case Damage = 'damage';
    case Lost = 'lost';
    case Found = 'found';

    public function direction(): InventoryDirection
    {
        return match ($this) {
            self::Opening, self::Purchase, self::SaleReturn,
            self::TransitIn, self::Found => InventoryDirection::In,

            self::Sale, self::PurchaseReturn, self::TransitOut,
            self::Damage, self::Lost => InventoryDirection::Out,

            // Adjustment goes either way; the caller states which.
            self::Adjustment => InventoryDirection::In,
        };
    }

    public function isAdjustment(): bool
    {
        return $this === self::Adjustment;
    }

    /**
     * The account that sits opposite Inventory for this movement.
     *
     * Purchases and returns are settled by the purchasing and sales modules,
     * which supply their own counter-account (Accounts Payable, Goods in
     * Transit); those return null here. What remains are the movements that
     * have no document behind them, where the value has to land somewhere in
     * the P&L or it silently disappears.
     */
    public function counterAccountKey(): ?string
    {
        return match ($this) {
            self::Opening => 'opening_balance_equity',
            self::Damage, self::Lost => 'inventory_shrinkage',
            self::Found => 'inventory_shrinkage',
            self::Adjustment => 'inventory_shrinkage',
            default => null,
        };
    }

    /** Movements this service posts to the ledger on its own. */
    public function postsOwnJournalEntry(): bool
    {
        return $this->counterAccountKey() !== null;
    }

    public function label(): string
    {
        return match ($this) {
            self::Opening => 'Opening stock',
            self::Purchase => 'Purchase',
            self::PurchaseReturn => 'Purchase return',
            self::Sale => 'Sale',
            self::SaleReturn => 'Sales return',
            self::TransitOut => 'Shipped',
            self::TransitIn => 'Returned to stock',
            self::Adjustment => 'Stock adjustment',
            self::Damage => 'Damage',
            self::Lost => 'Lost',
            self::Found => 'Found',
        };
    }
}
