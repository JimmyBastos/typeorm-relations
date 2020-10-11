import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import CustomersRepository from '@modules/customers/infra/typeorm/repositories/CustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';
import OrdersProducts from '../infra/typeorm/entities/OrdersProducts';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    const findProductInArray = (
      productList: IProduct[],
      product_id: string,
    ): IProduct => {
      return (
        productList.find(({ id }) => id === product_id) || ({} as IProduct)
      );
    };

    if (!customer) {
      throw new AppError('Could not find any customer with the informed id.');
    }

    const existingProducts = await this.productsRepository.findAllById(
      products,
    );

    if (!existingProducts.length) {
      throw new AppError('Could not find any order with the informed ids.');
    }

    const existingProductIds = existingProducts.map(({ id }) => id);

    const notFoundProducts = products.filter(
      product => !existingProductIds.includes(product.id),
    );

    if (notFoundProducts.length) {
      const notFoundProduct = notFoundProducts.slice().shift();
      throw new AppError(
        `Could not find any product with the informed ids: ${notFoundProduct?.id}`,
      );
    }

    const notAvaliableProducts = products.filter(product => {
      const existingProduct = findProductInArray(existingProducts, product.id);

      return product.quantity > existingProduct?.quantity;
    });

    if (notAvaliableProducts.length) {
      const notAvaliableProduct = notAvaliableProducts.slice().shift();
      throw new AppError(
        `The quantity ${notAvaliableProduct?.quantity} is not avaliable for product ${notAvaliableProduct?.id}`,
      );
    }

    const order = await this.ordersRepository.create({
      customer,
      products: existingProducts.map(existingProduct => ({
        product_id: existingProduct.id,
        price: existingProduct.price,
        quantity: findProductInArray(products, existingProduct.id).quantity,
      })),
    });

    const updateOrderedProductsQuantity = existingProducts.map(
      existingProduct => ({
        id: existingProduct.id,
        quantity:
          existingProduct.quantity -
          findProductInArray(products, existingProduct.id).quantity,
      }),
    );

    await this.productsRepository.updateQuantity(updateOrderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
