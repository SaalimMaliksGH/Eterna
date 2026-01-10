import { Router } from 'express';
import { tokenController } from '../controllers/token.controller';

const router = Router();

/**
 * @route   GET /api/tokens
 * @desc    Get paginated list of tokens with filtering and sorting
 * @query   limit, cursor, sortBy, order, period, search, minVolume
 * @access  Public
 */
router.get('/tokens', (req, res, next) => tokenController.getTokens(req, res, next));

/**
 * @route   GET /api/tokens/:address
 * @desc    Get specific token by address
 * @params  address
 * @access  Public
 */
router.get('/tokens/:address', (req, res, next) => tokenController.getTokenByAddress(req, res, next));

/**
 * @route   GET /api/search
 * @desc    Search tokens by name/ticker
 * @query   q
 * @access  Public
 */
router.get('/search', (req, res, next) => tokenController.searchTokens(req, res, next));

/**
 * @route   GET /api/health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/health', (req, res) => tokenController.getHealth(req, res));

export default router;
