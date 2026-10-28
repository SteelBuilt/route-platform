ALTER TABLE "organizations" DROP CONSTRAINT "organizations_sector_role";--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_sector_role" CHECK ("organizations"."industry_sector" IS NULL
      OR "organizations"."industry_sector" IN ('red_iron', 'cold_formed_steel')
      OR ("organizations"."industry_sector" = 'tube_steel' AND "organizations"."kind" IN ('poster', 'installer', 'delivery_installer'))
      OR ("organizations"."industry_sector" = 'portable_sheds' AND "organizations"."kind" IN ('poster', 'transporter')));