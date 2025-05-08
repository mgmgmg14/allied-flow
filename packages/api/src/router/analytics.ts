import { z } from "zod";
import { protectedProcedure } from "../trpc.js";
import { analyticsService } from "../services/analytics";
import type { TRPCRouterRecord } from "@trpc/server";
import { db } from "@repo/db/client";

const dateRangeSchema = z.object({
  start_date: z.date(),
  end_date: z.date(),
});

const filtersSchema = z.object({
  productIds: z.array(z.string()).optional(),
  clientIds: z.array(z.string()).optional(),
});

export const analyticsRouter = {
  getSummary: protectedProcedure
    .input(dateRangeSchema.extend({
      productIds: z.array(z.string()).optional(),
      clientIds: z.array(z.string()).optional(),
    }))
    .query(async ({ input }) => {
      return await db.transaction(async (tx) => {
        const [salesMetrics, inquiryMetrics] = await Promise.all([
          analyticsService.getSalesMetrics(tx, input),
          analyticsService.getInquiryMetrics(tx, input),
        ]);

        return {
          sales: salesMetrics,
          inquiries: inquiryMetrics,
        };
      });
    }),

  getProductRankings: protectedProcedure
    .input(
      z.object({
        dateRange: dateRangeSchema,
        sortBy: z.enum(["revenue", "orders"]),
        sortOrder: z.enum(["asc", "desc"]),
        limit: z.number().min(1).max(100).optional(),
        filters: filtersSchema.optional(),
      })
    )
    .query(async ({ input }) => {
      return await db.transaction(async (tx) => {
        return analyticsService.getProductRankings(
          tx,
          input.dateRange,
          {
            sortBy: input.sortBy,
            sortOrder: input.sortOrder,
            limit: input.limit,
            filters: input.filters,
          }
        );
      });
    }),

  getRevenueSeries: protectedProcedure
    .input(
      z.object({
        dateRange: z.object({
          start_date: z.date(),
          end_date: z.date(),
        }),
        comparison: z.boolean().optional().default(false),
        filters: z
          .object({
            productIds: z.array(z.string()).optional(),
            clientIds: z.array(z.string()).optional(),
          })
          .optional(),
      })
    )
    .query(async ({ input }) => {
      return await db.transaction(async (tx) => {
        return await analyticsService.getRevenueTimeSeries(tx, input.dateRange, {
          comparison: input.comparison,
          filters: input.filters,
        });
      });
    }),
} satisfies TRPCRouterRecord; 
