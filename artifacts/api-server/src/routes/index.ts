import { Router, type IRouter } from "express";
import healthRouter from "./health";
import meRouter from "./me";
import roomsRouter from "./rooms";
import paymentsRouter from "./payments";
import redeemRouter from "./redeem";
import voiceRouter from "./voice";
import tokensRouter from "./tokens";
import shortenRouter from "./shorten";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(roomsRouter);
router.use(paymentsRouter);
router.use(redeemRouter);
router.use(voiceRouter);
router.use(tokensRouter);
router.use(shortenRouter);
router.use(adminRouter);

export default router;
